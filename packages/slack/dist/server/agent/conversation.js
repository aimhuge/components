export const MAX_REMEMBERED = 20;
export const DM_IDLE_MS = 6 * 60 * 60 * 1000;
/** Where to answer an event, and which conversation it belongs to. */
export function conversationKey(event) {
    const isDm = event.channel_type === "im" || event.channel.startsWith("D");
    if (isDm) {
        return {
            teamId: event.team,
            channelId: event.channel,
            threadKey: event.thread_ts ?? "dm",
            replyThreadTs: event.thread_ts ?? null,
            place: "dm",
        };
    }
    const root = event.thread_ts ?? event.ts;
    return { teamId: event.team, channelId: event.channel, threadKey: root, replyThreadTs: root, place: "channel" };
}
function asMessages(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw.filter((m) => !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.text === "string");
}
/** The remembered turns, oldest first. A failed read is an empty memory, not an error. */
export async function loadConversation(service, key, nowMs = Date.now()) {
    const { data, error } = await service
        .from("slack_conversations")
        .select("messages, updated_at")
        .eq("team_id", key.teamId)
        .eq("channel_id", key.channelId)
        .eq("thread_key", key.threadKey)
        .maybeSingle();
    if (error || !data)
        return [];
    if (key.threadKey === "dm" && nowMs - Date.parse(String(data.updated_at)) > DM_IDLE_MS)
        return [];
    return asMessages(data.messages);
}
/** Remember this turn. Best-effort: losing memory must not lose the answer already sent. */
export async function saveConversation(service, key, userId, messages) {
    const { error } = await service.from("slack_conversations").upsert({
        team_id: key.teamId,
        channel_id: key.channelId,
        thread_key: key.threadKey,
        user_id: userId,
        messages: messages.slice(-MAX_REMEMBERED),
        updated_at: new Date().toISOString(),
    }, { onConflict: "team_id,channel_id,thread_key" });
    if (error)
        console.warn(`[slack/conversation] saving ${key.teamId}/${key.channelId} failed: ${error.message}`);
}
