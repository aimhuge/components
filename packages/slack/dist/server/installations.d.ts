/**
 * The `slack_installations` row — the bot token, the workspace, the status.
 * One row per Slack workspace the app is installed in.
 *
 * Service-role only: the caller does the workspace membership check first;
 * every function takes the service client. Tokens are never logged: error
 * messages here carry the database's error code, not the bot token.
 *
 * The package owns the workspace row. The app owns its own channel rows —
 * `saveInstallation` and `revokeInstallation` touch `slack_installations`
 * only. The app wraps these to refresh its own channel rows on a reinstall.
 *
 * A REINSTALL REFRESHES, IT DOESN'T REVIVE. `saveInstallation` rewrites the
 * token on the install row; a revoked install stays revoked until it is
 * connected again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SlackInstall } from "./oauth.js";
/**
 * `teamChannelId(teamId, channelId)` — the externally-meaningful id of a
 * Slack destination. Team ids start with `T` (or `E` for enterprise),
 * channel ids with `C` (channel), `G` (group / Slack Connect), or `D` (DM).
 * Parsed back via `parseTeamChannelId`.
 */
export declare function teamChannelId(teamId: string, channelId: string): string;
/** The two halves of `teamChannelId`, or null for anything else. */
export declare function parseTeamChannelId(id: string | null | undefined): {
    teamId: string;
    channelId: string;
} | null;
/**
 * Persist a fresh (or renewed) install. `on conflict team_id` upserts in
 * place: the row is keyed by the team id, and one workspace has one bot
 * token. Throws on a DB error (DB message only — no token in the message).
 */
export declare function saveInstallation(service: SupabaseClient, install: SlackInstall, installedBy: string | null): Promise<void>;
/** A team's bot token, for the publisher. Null when missing or revoked. */
export declare function getInstallation(service: SupabaseClient, teamId: string): Promise<{
    teamId: string;
    teamName: string | null;
    botUserId: string;
    botToken: string;
    status: string;
} | null>;
/**
 * Mark a workspace uninstalled. Keeps the row (NOT NULL on bot_token; a
 * revoked row is never read for its token by anyone). Returns true when the
 * update ran, false (and a warning) on a DB error — the user has already
 * been redirected and a missed bookkeeping update isn't worth throwing for.
 */
export declare function revokeInstallation(service: SupabaseClient, teamId: string): Promise<boolean>;
