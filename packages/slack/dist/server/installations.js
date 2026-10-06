/**
 * `teamChannelId(teamId, channelId)` — the externally-meaningful id of a
 * Slack destination. Team ids start with `T` (or `E` for enterprise),
 * channel ids with `C` (channel), `G` (group / Slack Connect), or `D` (DM).
 * Parsed back via `parseTeamChannelId`.
 */
export function teamChannelId(teamId, channelId) {
    return `${teamId}:${channelId}`;
}
/** The two halves of `teamChannelId`, or null for anything else. */
export function parseTeamChannelId(id) {
    if (!id)
        return null;
    const parts = id.split(":");
    if (parts.length !== 2)
        return null;
    const [teamId, channelId] = parts;
    if (!teamId || !channelId)
        return null;
    if (!/^[TE][A-Z0-9]+$/.test(teamId))
        return null;
    if (!/^[CGD][A-Z0-9]+$/.test(channelId))
        return null;
    return { teamId, channelId };
}
/**
 * Persist a fresh (or renewed) install. `on conflict team_id` upserts in
 * place: the row is keyed by the team id, and one workspace has one bot
 * token. Throws on a DB error (DB message only — no token in the message).
 */
export async function saveInstallation(service, install, installedBy) {
    const { error } = await service
        .from("slack_installations")
        .upsert({
        team_id: install.teamId,
        team_name: install.teamName,
        enterprise_id: install.enterpriseId,
        bot_user_id: install.botUserId,
        bot_token: install.botToken,
        scopes: install.scopes,
        installed_by: installedBy,
        status: "active",
        updated_at: new Date().toISOString(),
    }, { onConflict: "team_id" });
    if (error)
        throw new Error(`saveInstallation: ${error.message}`);
}
/** A team's bot token, for the publisher. Null when missing or revoked. */
export async function getInstallation(service, teamId) {
    const { data, error } = await service
        .from("slack_installations")
        .select("team_id, team_name, bot_user_id, bot_token, status")
        .eq("team_id", teamId)
        .maybeSingle();
    if (error)
        throw new Error(`getInstallation: ${error.message}`);
    if (!data || data.status === "revoked")
        return null;
    return {
        teamId: data.team_id,
        teamName: data.team_name ?? null,
        botUserId: data.bot_user_id,
        botToken: data.bot_token,
        status: data.status,
    };
}
/**
 * Mark a workspace uninstalled. Keeps the row (NOT NULL on bot_token; a
 * revoked row is never read for its token by anyone). Returns true when the
 * update ran, false (and a warning) on a DB error — the user has already
 * been redirected and a missed bookkeeping update isn't worth throwing for.
 */
export async function revokeInstallation(service, teamId) {
    const { error } = await service
        .from("slack_installations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("team_id", teamId);
    if (error) {
        console.warn(`[slack/installations] revoke installation failed for ${teamId}: ${error.message}`);
        return false;
    }
    return true;
}
