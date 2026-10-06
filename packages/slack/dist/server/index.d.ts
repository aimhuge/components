/**
 * @aimhuge/slack/server — everything that calls Slack or touches Supabase.
 *
 * `server-only` makes a client-component import a BUILD failure in a Next app,
 * rather than a bot token's code path (and its env reads) in a browser bundle.
 * The client-safe half (mrkdwn, toggles, webhook URLs) is `@aimhuge/slack`.
 */
import "server-only";
export { SLACK_TIMEOUT_MS, callSlack, isSlackAuthError, str, type CallOptions, type SlackAttempt } from "./api.js";
export { findMessageByMetadata, getPermalink, joinChannel, openDm, postEphemeral, postMessage, updateMessage, type Block, type Deps as MessageDeps, type MessageMetadata, } from "./messages.js";
export { liveWebhookUrl, slackAppConfig, slackConfigured, type SlackAppConfig } from "./config.js";
export { SLACK_REPLAY_WINDOW_S, verifySlackRequest, type VerifyInput } from "./verify.js";
export { fireWebhook, postWebhook, type PostWebhookDeps } from "./webhook.js";
export { buildInstallUrl, decodeOAuthState, encodeOAuthState, exchangeSlackCode, newOAuthNonce, nonceMatches, oauthCookieOptions, parseSlackInstall, type SlackInstall, } from "./oauth.js";
export { getInstallation, parseTeamChannelId, revokeInstallation, saveInstallation, teamChannelId } from "./installations.js";
export { LINK_TOKEN_TTL_MS, linkSlackUser, linkUrl, linkedUserId, linksForUser, signLinkToken, verifyLinkToken, type SignLinkTokenInput, type VerifiedLink, } from "./links.js";
export { sendToChannel, sendToUser, type OutgoingMessage, type SendResult } from "./send.js";
export { firstDelivery, isPersonMessage, isUninstallEvent, messageText, readSlackRequest, type ReadSlackRequestResult, type SlackEnvelope, type SlackEvent, } from "./events.js";
export { findAction, inputValue, parseInteractionBody, replaceMessage, respondTo, whisper, type InteractionDeps, type InteractionPayload, } from "./interactions.js";
export { BUDGET_MS, MAX_TURNS, TOOL_RESULT_MAX_CHARS, buildMessages, fenceInstructions, runAgent, toolResultText, toolsFromMcp, type AgentDeps, type AgentMessage, type AgentResult, type AgentTool, type ChatMessage, type ModelTurn, type RunAgentInput, type TextBlock, type ToolResultBlock, type ToolUseBlock, } from "./agent/loop.js";
export { DM_IDLE_MS, MAX_REMEMBERED, conversationKey, loadConversation, saveConversation, type ConversationKey, } from "./agent/conversation.js";
