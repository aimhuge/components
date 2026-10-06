/**
 * Slack incoming-webhook URL helpers. An incoming-webhook URL is a bearer
 * secret — anyone holding it can post to that channel — so it's logged
 * nowhere and shown to a person only in masked form. Slack's hook URL shape
 * is fixed: `https://hooks.slack.com/services/<team>/<app>/<token>`, and the
 * token is the secret half (DeckCP stores the whole URL, BlastCP stores the
 * URL in env).
 */
/** True iff `url` is a Slack incoming-webhook URL. Nothing else. */
export declare function isSlackWebhookUrl(url: string): boolean;
/**
 * What a settings page may show: `hooks.slack.com/…/<last 4>`. The last four
 * characters of the URL are the only safe hint at which webhook it is; the
 * rest identifies the team and app, both of which are visible elsewhere.
 */
export declare function maskWebhookUrl(url: string): string;
