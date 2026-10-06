/**
 * Slack's OAuth wire protocol: the consent URL, the code exchange, the parse
 * of the `oauth.v2.access` response, and the connect flow's CSRF state.
 * Nothing here touches the database: `./installations.ts` owns the stored
 * grant; `./api.ts` owns the fetch.
 *
 * Verified against Slack's current OAuth v2 documentation (2026-10):
 *  - authorize  `https://slack.com/oauth/v2/authorize`
 *  - token      `POST https://slack.com/api/oauth.v2.access`  (form body)
 *
 * This package is app-neutral: the app picks its own redirect URI, cookie
 * name, scopes, and the safe-slug validator for its own state fields (e.g. an
 * org slug). The package owns the bits the app can't get wrong — the nonce
 * round trip, the state shape check, the `oauth.v2.access` parse.
 *
 * Tokens are never logged: errors carry Slack's error code and the HTTP
 * status, never the access token.
 */
import { callSlack, str } from "./api.js";

/**
 * A 16-byte nonce, base64url. The nonce rides in two places: inside `state`,
 * which Slack echoes back, and in an httpOnly cookie the app sets, which only
 * the browser that STARTED the flow holds. The callback requires both.
 * Without the cookie, a signed-in member could be handed a callback URL
 * carrying an attacker's authorization code and attach the attacker's Slack
 * workspace to the victim's property.
 */
export function newOAuthNonce(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** base64url(JSON.stringify(payload)). The app's own fields ride alongside the nonce. */
export function encodeOAuthState(payload: Record<string, unknown> & { nonce: string }): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * The state `encodeOAuthState` minted, or null for anything else. The package
 * checks the nonce (string, ≥ 16 chars) and JSON shape; the app's `validate`
 * checks its own fields (e.g. safe slugs). On any failure, returns null —
 * the caller cannot distinguish "tampered" from "expired", because both mean
 * the same thing: don't trust it.
 */
export function decodeOAuthState<T>(
  raw: string | null | undefined,
  validate: (obj: Record<string, unknown>) => T | null,
): (T & { nonce: string }) | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const nonce = obj.nonce;
  if (typeof nonce !== "string" || nonce.length < 16) return null;
  const validated = validate(obj);
  if (!validated) return null;
  return { ...validated, nonce };
}

/** Constant-time nonce comparison. A missing cookie never matches. */
export function nonceMatches(fromState: string, fromCookie: string | null | undefined): boolean {
  if (!fromCookie || fromState.length !== fromCookie.length) return false;
  let diff = 0;
  for (let i = 0; i < fromState.length; i++) diff |= fromState.charCodeAt(i) ^ fromCookie.charCodeAt(i);
  return diff === 0;
}

/** httpOnly cookie the app sets on `/api/slack/install` and reads on the callback. */
export function oauthCookieOptions(opts: { path: string; secure: boolean; maxAgeS?: number }): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // Lax still rides Slack's top-level redirect back to the callback.
    sameSite: "lax",
    secure: opts.secure,
    path: opts.path,
    maxAge: opts.maxAgeS ?? 600,
  };
}

// ── OAuth ───────────────────────────────────────────────────────────────────

/**
 * Slack's consent URL. The app picks the redirect URI and the scopes it
 * wants on the install. `user_scope` is sent only when given — the per-user
 * link flow is a different round-trip with its own scopes.
 *
 * Slack's scope list is documented as "comma-separated" and every example
 * comma-separates it.
 */
export function buildInstallUrl(opts: {
  clientId: string;
  scopes: readonly string[];
  redirectUri: string;
  state: string;
  userScopes?: readonly string[];
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    scope: opts.scopes.join(","),
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  if (opts.userScopes) params.set("user_scope", opts.userScopes.join(","));
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/** What Slack's `oauth.v2.access` returns, parsed. See `parseSlackInstall`. */
export interface SlackInstall {
  teamId: string;
  teamName: string | null;
  enterpriseId: string | null;
  botUserId: string;
  botToken: string;
  scopes: string;
  installerSlackUserId: string | null;
  /** The channel the installer picked on Slack's consent screen. Null when
   *  the installer skipped it — `no_channel` in the callback, since the
   *  picker is the only way a channel lands in the install. */
  channelId: string | null;
  channelName: string | null;
  /** The install's incoming webhook URL. Apps that post through the install's
   *  own webhook (not `chat.postMessage`) need it. Null when no webhook
   *  scope was granted or the installer skipped the channel picker. */
  webhookUrl: string | null;
  /** Where the installer manages the webhook on Slack's side. Null when no
   *  webhook was minted, or Slack didn't return one. */
  configurationUrl: string | null;
}

/**
 * Read the `oauth.v2.access` body. Pure: no fetch, no env. Throws
 * `Error("slack_install_incomplete")` when the bot token, team id or bot
 * user id is missing — the three things `installations.ts` cannot work
 * without. Never puts the token in an error message.
 */
export function parseSlackInstall(data: Record<string, unknown>): SlackInstall {
  const accessToken = str(data, "access_token");
  // Slack bot tokens are `xoxb-…`. Anything else is either a user token or a
  // garbage response, and we never want to store one as a bot token.
  if (!accessToken || !accessToken.startsWith("xoxb-")) {
    throw new Error("slack_install_incomplete");
  }

  const team = (data.team ?? {}) as Record<string, unknown>;
  const teamId = str(team, "id");
  if (!teamId) throw new Error("slack_install_incomplete");

  const botUserId = str(data, "bot_user_id");
  if (!botUserId) throw new Error("slack_install_incomplete");

  const authedUser = (data.authed_user ?? {}) as Record<string, unknown>;
  const incomingWebhook = (data.incoming_webhook ?? null) as Record<string, unknown> | null;

  return {
    teamId,
    teamName: str(team, "name"),
    enterpriseId: str((data.enterprise ?? null) as Record<string, unknown> | null, "id"),
    botUserId,
    botToken: accessToken,
    scopes: typeof data.scope === "string" ? data.scope : "",
    installerSlackUserId: str(authedUser, "id"),
    channelId: incomingWebhook ? str(incomingWebhook, "channel_id") : null,
    channelName: incomingWebhook ? str(incomingWebhook, "channel") : null,
    webhookUrl: incomingWebhook ? str(incomingWebhook, "url") : null,
    configurationUrl: incomingWebhook ? str(incomingWebhook, "configuration_url") : null,
  };
}

/**
 * Exchange the callback's authorization code for a bot token. The same flow
 * mints the `incoming-webhook` channel the installer picked on Slack's consent
 * screen — `parseSlackInstall` reads that off the response. Throws on a
 * refused exchange (`kind === "refused"`) or a request that never reached
 * Slack (`kind === "unreached"`); the message carries Slack's error code and
 * the HTTP status, never the code or the client secret.
 */
export async function exchangeSlackCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<SlackInstall> {
  const attempt = await callSlack("oauth.v2.access", {
    form: {
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    },
    fetchImpl: opts.fetchImpl,
  });
  if (attempt.kind === "refused") {
    throw new Error(`slack token exchange failed (${attempt.status} ${attempt.error})`);
  }
  if (attempt.kind !== "ok") {
    throw new Error(`slack token exchange failed (${attempt.kind})`);
  }
  return parseSlackInstall(attempt.data);
}
