type Env = Record<string, string | undefined>;
export interface SlackAppConfig {
    clientId: string;
    clientSecret: string;
    /** Signs every request Slack sends us (events). Not the client secret. */
    signingSecret: string;
}
/** The app's OAuth and signing credentials, or null until all three are set. */
export declare function slackAppConfig(env?: Env): SlackAppConfig | null;
export declare const slackConfigured: (env?: Env) => boolean;
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
export declare function liveWebhookUrl(opts: {
    name: string;
    devFlag?: string;
}, env?: Env): string | null;
export {};
