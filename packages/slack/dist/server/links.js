import crypto from "node:crypto";
/** 15 minutes, the same window the per-user link URL lives for. */
export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
/**
 * Sign a link token: `<base64url payload>.<base64url HMAC>`.
 *
 * The payload is JSON, base64url-encoded; the signature is HMAC-SHA256 over
 * the EXACT bytes of the payload part (not the full token), keyed by `secret`.
 * The 15-minute TTL lives in the payload, so it's bound to the signature and
 * can't be edited by the recipient.
 */
export function signLinkToken(input, secret, nowMs = Date.now()) {
    const payload = {
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
export function verifyLinkToken(token, secret, nowMs = Date.now()) {
    if (typeof token !== "string")
        return null;
    const dot = token.indexOf(".");
    if (dot <= 0 || dot === token.length - 1)
        return null;
    const payloadPart = token.slice(0, dot);
    const sigPart = token.slice(dot + 1);
    const expectedSig = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
    // Equal-length compare first: timingSafeEqual throws on a length mismatch.
    if (expectedSig.length !== sigPart.length)
        return null;
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sigPart)))
        return null;
    let parsed;
    try {
        parsed = JSON.parse(fromBase64Url(payloadPart));
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object")
        return null;
    const p = parsed;
    const teamId = p.t;
    const slackUserId = p.u;
    const teamName = p.n;
    const exp = p.e;
    if (typeof teamId !== "string" || !/^[TE]/.test(teamId))
        return null;
    if (typeof slackUserId !== "string" || !/^[UW]/.test(slackUserId))
        return null;
    if (teamName !== null && typeof teamName !== "string")
        return null;
    if (typeof exp !== "number" || !Number.isFinite(exp))
        return null;
    if (exp < nowMs)
        return null;
    return { teamId, slackUserId, teamName: teamName };
}
/**
 * Build the URL the bot DMs to the Slack person. The path defaults to
 * `/slack/link`, the convention BlastCP and DrayKE both adopt; apps that
 * mount the link page elsewhere can pass a different path.
 */
export function linkUrl(origin, token, path = "/slack/link") {
    return `${origin.replace(/\/+$/, "")}${path}?t=${encodeURIComponent(token)}`;
}
/**
 * Look up the app user this Slack person is currently linked as, if any.
 * Used by the client to short-circuit the "link your account" path for anyone
 * who already linked (the link page itself is still useful as a re-link).
 */
export async function linkedUserId(service, teamId, slackUserId) {
    const { data } = await service
        .from("slack_user_links")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("slack_user_id", slackUserId)
        .maybeSingle();
    return data?.user_id ?? null;
}
/**
 * Upsert a `(team_id, slack_user_id)` → `user_id` mapping. The PK is the pair,
 * so a Slack person re-linking to a different app account replaces the old
 * link — a person owns one Slack identity, so they shouldn't appear to act
 * as two app users. Throws on DB error (caller renders an error page).
 */
export async function linkSlackUser(service, input) {
    const { error } = await service
        .from("slack_user_links")
        .upsert({ team_id: input.teamId, slack_user_id: input.slackUserId, user_id: input.userId }, { onConflict: "team_id,slack_user_id" });
    if (error)
        throw new Error(`linkSlackUser: ${error.message}`);
}
/**
 * Every `(team, slackUser)` the user is currently linked to, newest first.
 * "Newest" is `created_at` desc — the order `sendToUser` walks to find the
 * first install that's still alive.
 */
export async function linksForUser(service, userId) {
    const { data } = await service
        .from("slack_user_links")
        .select("team_id, slack_user_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    return (data ?? []).map((row) => ({
        teamId: row.team_id,
        slackUserId: row.slack_user_id,
        createdAt: row.created_at,
    }));
}
/** base64url encode a UTF-8 string (Node's "base64url" omits `=` padding). */
function toBase64Url(s) {
    return Buffer.from(s, "utf8").toString("base64url");
}
/** Inverse of `toBase64Url`. */
function fromBase64Url(s) {
    return Buffer.from(s, "base64url").toString("utf8");
}
