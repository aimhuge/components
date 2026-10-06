/**
 * The client-safe half of `@aimhuge/slack`. Pure functions only — no
 * network, no secrets, no `node:*` imports. Safe to ship in a browser
 * bundle alongside React components.
 */
export {
  clip,
  escSlack,
  markdownToMrkdwn,
  slackLink,
} from "./mrkdwn.js";
export { isSlackWebhookUrl, maskWebhookUrl } from "./webhook-url.js";
export { isToggleOn, resolveToggles, toggleDeviations } from "./toggles.js";