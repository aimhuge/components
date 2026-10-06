/**
 * Slack incoming-webhook URL helpers. An incoming-webhook URL is a bearer
 * secret — anyone holding it can post to that channel — so it's logged
 * nowhere and shown to a person only in masked form. Slack's hook URL shape
 * is fixed: `https://hooks.slack.com/services/<team>/<app>/<token>`, and the
 * token is the secret half (DeckCP stores the whole URL, BlastCP stores the
 * URL in env).
 */
const SLACK_HOOK_PREFIX = "https://hooks.slack.com/services/";
/** True iff `url` is a Slack incoming-webhook URL. Nothing else. */
export function isSlackWebhookUrl(url) {
    return typeof url === "string" && url.startsWith(SLACK_HOOK_PREFIX);
}
/**
 * What a settings page may show: `hooks.slack.com/…/<last 4>`. The last four
 * characters of the URL are the only safe hint at which webhook it is; the
 * rest identifies the team and app, both of which are visible elsewhere.
 */
export function maskWebhookUrl(url) {
    if (!isSlackWebhookUrl(url))
        return "";
    const tail = url.slice(-4);
    return `hooks.slack.com/…/${tail}`;
}
