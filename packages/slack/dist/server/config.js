/**
 * Every Slack environment read, in one place. OAuth + signing credentials
 * for the Slack app, and a per-feed helper that gates an incoming-webhook
 * URL behind the same "production OR dev-flag" rule: previews are production
 * builds and `.env.local` can hold the real URL, so a URL alone would post
 * every local signup / test event into our Slack. The URL is necessary,
 * not sufficient.
 *
 * Bot scopes are NOT exported here — each app declares its own (the BlastCP
 * app and the DeckCP app ask for different things).
 */
import { isSlackWebhookUrl } from "../webhook-url.js";
const clean = (v) => (v && v.trim() ? v.trim() : null);
/** The app's OAuth and signing credentials, or null until all three are set. */
export function slackAppConfig(env = process.env) {
    const clientId = clean(env.SLACK_CLIENT_ID);
    const clientSecret = clean(env.SLACK_CLIENT_SECRET);
    const signingSecret = clean(env.SLACK_SIGNING_SECRET);
    if (!clientId || !clientSecret || !signingSecret)
        return null;
    return { clientId, clientSecret, signingSecret };
}
export const slackConfigured = (env = process.env) => slackAppConfig(env) !== null;
/**
 * The incoming-webhook URL for a feed (the admin feed, a per-workspace feed,
 * …), or null when it must stay quiet. The URL passes two gates:
 *
 *   1. `isSlackWebhookUrl(env[name])` — it really is a Slack incoming webhook,
 *      and not a typo or an attacker-supplied URL.
 *   2. We are on the production deployment, or a dev flag has been set on
 *      purpose. A URL is not the guard: previews are production builds and
 *      `.env.local` can hold the real URL, so a URL alone would post every
 *      local signup into our Slack.
 *
 * The dev flag is per-feed (`SLACK_<NAME>_DEV` style — the caller names the
 * flag it wants to gate on), so two feeds can be on independently for local
 * testing.
 */
export function liveWebhookUrl(opts, env = process.env) {
    const url = clean(env[opts.name]);
    if (!url || !isSlackWebhookUrl(url))
        return null;
    const production = env.VERCEL_ENV === "production" && env.NODE_ENV === "production";
    if (production)
        return url;
    if (opts.devFlag && env[opts.devFlag] === "1")
        return url;
    return null;
}
