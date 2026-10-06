/**
 * The agent loop: one person's message in, one answer out, with as many
 * tool calls in between as the model asks for.
 *
 * Model-agnostic means THIS FILE has no model client — `AgentDeps.model`
 * does. Each app (or each adapter) decides where the instructions go: an
 * Anthropic-compatible API takes a top-level `system`; the gateway used
 * here drops `system`, so its adapter fences the instructions into the
 * first user turn (`fenceInstructions`). The loop passes the instructions
 * separately and never assumes either shape.
 *
 * Pure apart from its two injected dependencies, the model and the tool
 * runner, so the loop's rules are tested without a gateway or a database
 * (`__tests__/agent.test.ts`):
 *
 *  - a tool error goes back to the model as an `is_error` result, never up:
 *    the model reads "Not a member of workspace X" and corrects itself;
 *  - at most `MAX_TURNS` model calls and a wall-clock `BUDGET_MS`, because
 *    the whole run lives inside one function invocation's `after()`;
 *  - tool output is capped before it goes back, so one huge list can't
 *    fill the context and starve the answer.
 */
export const MAX_TURNS = 10;
export const BUDGET_MS = 240_000;
export const TOOL_RESULT_MAX_CHARS = 20_000;
/**
 * Fence the instructions into the first user turn. For adapters that drop
 * the top-level `system` field (the gateway used here does, by design) —
 * the loop passes them separately and the adapter chooses the wire shape.
 * The model still sees them as text the first user turn contains.
 */
export function fenceInstructions(instructions, messages) {
    const first = messages[0];
    if (!instructions.trim() || !first || first.role !== "user")
        return messages;
    const fenced = { type: "text", text: `<instructions>\n${instructions}\n</instructions>` };
    return [{ role: "user", content: [fenced, ...first.content] }, ...messages.slice(1)];
}
/**
 * The remembered conversation as alternating `AgentMessage` turns, ending
 * with the new message. Leading assistant turns are dropped and same-role
 * neighbours merged, because the API wants user first and strict alternation
 * — and a conversation saved by an older run might not have it.
 */
export function buildMessages(history, message) {
    const turns = [];
    for (const m of [...history, { role: "user", text: message }]) {
        if (!m.text.trim())
            continue;
        if (turns.length === 0 && m.role === "assistant")
            continue;
        const last = turns[turns.length - 1];
        if (last && last.role === m.role)
            last.text = `${last.text}\n\n${m.text}`;
        else
            turns.push({ ...m });
    }
    return turns.map((t) => t.role === "user"
        ? { role: "user", content: [{ type: "text", text: t.text }] }
        : { role: "assistant", content: [{ type: "text", text: t.text }] });
}
/** An MCP tool result (`{ content: [{ type: "text", text }] }`) as the text the model reads. */
export function toolResultText(result) {
    let text;
    const content = result?.content;
    if (Array.isArray(content)) {
        text = content
            .map((c) => (c && typeof c === "object" && typeof c.text === "string" ? c.text : ""))
            .filter(Boolean)
            .join("\n");
    }
    else {
        text = typeof result === "string" ? result : JSON.stringify(result ?? null);
    }
    if (text.length <= TOOL_RESULT_MAX_CHARS)
        return text;
    return `${text.slice(0, TOOL_RESULT_MAX_CHARS)}\n…[cut: the result was ${text.length} characters. Ask for less — a filter, a smaller limit.]`;
}
/** Map MCP `tools/list` entries to the shape the model adapters accept. */
export function toolsFromMcp(tools, exclude) {
    return tools
        .filter((t) => !exclude?.has(t.name))
        .map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
}
const textOf = (turn) => turn.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
/** Run the loop. Never throws: a model failure becomes an apology the person can act on. */
export async function runAgent(input, deps) {
    const now = deps.now ?? Date.now;
    const maxTurns = input.limits?.maxTurns ?? MAX_TURNS;
    const budgetMs = input.limits?.budgetMs ?? BUDGET_MS;
    const startedAt = now();
    const messages = buildMessages(input.history, input.message);
    const toolCalls = [];
    let lastText = "";
    for (let turn = 0; turn < maxTurns; turn++) {
        if (now() - startedAt > budgetMs)
            return { text: outOfTime(lastText), toolCalls, stopped: "time" };
        let reply;
        try {
            reply = await deps.model({ instructions: input.instructions, messages, tools: input.tools });
        }
        catch (err) {
            console.warn(`[slack/agent] model call failed: ${err instanceof Error ? err.message : String(err)}`);
            return {
                text: "I couldn't reach the model just now, so nothing was changed. Try again in a minute.",
                toolCalls,
                stopped: "model_error",
            };
        }
        const text = textOf(reply);
        if (text)
            lastText = text;
        const uses = reply.content.filter((b) => b.type === "tool_use");
        if (uses.length === 0 || reply.stopReason !== "tool_use") {
            return { text: text || lastText || "Done.", toolCalls };
        }
        messages.push({ role: "assistant", content: reply.content });
        const results = [];
        for (const use of uses) {
            toolCalls.push(use.name);
            try {
                results.push({ type: "tool_result", tool_use_id: use.id, content: toolResultText(await deps.callTool(use.name, use.input)) });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                results.push({ type: "tool_result", tool_use_id: use.id, content: message || "The tool failed.", is_error: true });
            }
        }
        messages.push({ role: "user", content: results });
    }
    return {
        text: `${lastText ? `${lastText}\n\n` : ""}_I stopped after ${maxTurns} steps. Tell me what to do next and I'll pick it up._`,
        toolCalls,
        stopped: "turns",
    };
}
function outOfTime(lastText) {
    return `${lastText ? `${lastText}\n\n` : ""}_I ran out of time on this one. Anything I finished is saved; ask again and I'll carry on._`;
}
