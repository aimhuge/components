/**
 * Link a Slack person to an app account.
 *
 * How: the bot DMs them a `<origin>/<path>?t=…` URL whose payload names
 * HMAC(s, secret) (team, Slack user, team name, 15-minute expiry). The page
 * needs BOTH halves to act — only the Slack person named in the payload was
 * sent the URL, and only a signed-in app user can press the button. The
 * button calls `linkSlackUser`, which UPSERTS on `(team_id, slack_user_id)`,
 * so re-linking to a different app account replaces the old one (the
 * previous link's user is no longer the one this Slack person acts as;
 * that's the intent).
 *
 * Pure: the secret is a parameter, not a module read, so the unit tests
 * sign and verify against a known value with no env.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

/** 15 minutes, the same window the per-user link URL lives for. */
export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

export interface SignLinkTokenInput {
  teamId: string;
  slackUserId: string;
  teamName?: string | null;
}

/** Short keys — the payload is one Slack message long, base64url JSON. */
interface PayloadShape {
  t: string;
  u: string;
  n: string | null;
  e: number;
}

export interface VerifiedLink {
  teamId: string;
  slackUserId: string;
  teamName: string | null;
}

/**
 * Sign a link token: `<base64url payload>.<base64url HMAC>`.
 *
 * The payload is JSON, base64url-encoded; the signature is HMAC-SHA256 over
 * the EXACT bytes of the payload part (not the full token), keyed by `secret`.
 * The 15-minute TTL lives in the payload, so it's bound to the signature and
 * can't be edited by the recipient.
 */
export function signLinkToken(input: SignLinkTokenInput, secret: string, nowMs: number = Date.now()): string {
  const payload: PayloadShape = {
    t: input.teamId,
    u: input.slackUserId,
    n: input.teamName ?? null,
    e: nowMs + LINK_TOKEN_TTL_MS,
  };
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return `${payloadPart}.${sig}`;
}

/**
 * Verify a token minted by `signLinkToken`. Returns null on ANY failure
 * (bad signature, expired, malformed payload, wrong shape) — the caller cannot
 * distinguish "the link expired" from "the link was tampered with", because
 * both mean the same thing: don't trust it.
 *
 * Shape rules:
 *   - `teamId` starts with `T` (a workspace) or `E` (an enterprise grid)
 *   - `slackUserId` starts with `U` (a person) or `W` (a rare legacy user id)
 *
 * These are Slack's own id prefixes; refusing anything else stops a tampered
 * payload from smuggling arbitrary strings into the upsert.
 */
export function verifyLinkToken(token: string, secret: string, nowMs: number = Date.now()): VerifiedLink | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  const expectedSig = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
  // Equal-length compare first: timingSafeEqual throws on a length mismatch.
  if (expectedSig.length !== sigPart.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sigPart))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(payloadPart));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const teamId = p.t;
  const slackUserId = p.u;
  const teamName = p.n;
  const exp = p.e;
  if (typeof teamId !== "string" || !/^[TE]/.test(teamId)) return null;
  if (typeof slackUserId !== "string" || !/^[UW]/.test(slackUserId)) return null;
  if (teamName !== null && typeof teamName !== "string") return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  if (exp < nowMs) return null;

  return { teamId, slackUserId, teamName: teamName as string | null };
}

/**
 * Build the URL the bot DMs to the Slack person. The path defaults to
 * `/slack/link`, the convention BlastCP and DrayKE both adopt; apps that
 * mount the link page elsewhere can pass a different path.
 */
export function linkUrl(origin: string, token: string, path = "/slack/link"): string {
  return `${origin.replace(/\/+$/, "")}${path}?t=${encodeURIComponent(token)}`;
}

/**
 * Look up the app user this Slack person is currently linked as, if any.
 * Used by the client to short-circuit the "link your account" path for anyone
 * who already linked (the link page itself is still useful as a re-link).
 */
export async function linkedUserId(
  service: SupabaseClient,
  teamId: string,
  slackUserId: string,
): Promise<string | null> {
  const { data } = await service
    .from("slack_user_links")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/**
 * Upsert a `(team_id, slack_user_id)` → `user_id` mapping. The PK is the pair,
 * so a Slack person re-linking to a different app account replaces the old
 * link — a person owns one Slack identity, so they shouldn't appear to act
 * as two app users. Throws on DB error (caller renders an error page).
 */
export async function linkSlackUser(
  service: SupabaseClient,
  input: { teamId: string; slackUserId: string; userId: string },
): Promise<void> {
  const { error } = await service
    .from("slack_user_links")
    .upsert(
      { team_id: input.teamId, slack_user_id: input.slackUserId, user_id: input.userId },
      { onConflict: "team_id,slack_user_id" },
    );
  if (error) throw new Error(`linkSlackUser: ${error.message}`);
}

/**
 * Every `(team, slackUser)` the user is currently linked to, newest first.
 * "Newest" is `created_at` desc — the order `sendToUser` walks to find the
 * first install that's still alive.
 */
export async function linksForUser(
  service: SupabaseClient,
  userId: string,
): Promise<Array<{ teamId: string; slackUserId: string; createdAt: string }>> {
  const { data } = await service
    .from("slack_user_links")
    .select("team_id, slack_user_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Array<{ team_id: string; slack_user_id: string; created_at: string }>).map((row) => ({
    teamId: row.team_id,
    slackUserId: row.slack_user_id,
    createdAt: row.created_at,
  }));
}

/** base64url encode a UTF-8 string (Node's "base64url" omits `=` padding). */
function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

/** Inverse of `toBase64Url`. */
function fromBase64Url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}