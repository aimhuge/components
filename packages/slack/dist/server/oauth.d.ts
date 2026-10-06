/**
 * A 16-byte nonce, base64url. The nonce rides in two places: inside `state`,
 * which Slack echoes back, and in an httpOnly cookie the app sets, which only
 * the browser that STARTED the flow holds. The callback requires both.
 * Without the cookie, a signed-in member could be handed a callback URL
 * carrying an attacker's authorization code and attach the attacker's Slack
 * workspace to the victim's property.
 */
export declare function newOAuthNonce(): string;
/** base64url(JSON.stringify(payload)). The app's own fields ride alongside the nonce. */
export declare function encodeOAuthState(payload: Record<string, unknown> & {
    nonce: string;
}): string;
/**
 * The state `encodeOAuthState` minted, or null for anything else. The package
 * checks the nonce (string, ≥ 16 chars) and JSON shape; the app's `validate`
 * checks its own fields (e.g. safe slugs). On any failure, returns null —
 * the caller cannot distinguish "tampered" from "expired", because both mean
 * the same thing: don't trust it.
 */
export declare function decodeOAuthState<T>(raw: string | null | undefined, validate: (obj: Record<string, unknown>) => T | null): (T & {
    nonce: string;
}) | null;
/** Constant-time nonce comparison. A missing cookie never matches. */
export declare function nonceMatches(fromState: string, fromCookie: string | null | undefined): boolean;
/** httpOnly cookie the app sets on `/api/slack/install` and reads on the callback. */
export declare function oauthCookieOptions(opts: {
    path: string;
    secure: boolean;
    maxAgeS?: number;
}): {
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
};
/**
 * Slack's consent URL. The app picks the redirect URI and the scopes it
 * wants on the install. `user_scope` is sent only when given — the per-user
 * link flow is a different round-trip with its own scopes.
 *
 * Slack's scope list is documented as "comma-separated" and every example
 * comma-separates it.
 */
export declare function buildInstallUrl(opts: {
    clientId: string;
    scopes: readonly string[];
    redirectUri: string;
    state: string;
    userScopes?: readonly string[];
}): string;
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
export declare function parseSlackInstall(data: Record<string, unknown>): SlackInstall;
/**
 * Exchange the callback's authorization code for a bot token. The same flow
 * mints the `incoming-webhook` channel the installer picked on Slack's consent
 * screen — `parseSlackInstall` reads that off the response. Throws on a
 * refused exchange (`kind === "refused"`) or a request that never reached
 * Slack (`kind === "unreached"`); the message carries Slack's error code and
 * the HTTP status, never the code or the client secret.
 */
export declare function exchangeSlackCode(opts: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    fetchImpl?: typeof fetch;
}): Promise<SlackInstall>;
