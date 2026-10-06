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
/** A block in a user or assistant turn. */
export type TextBlock = {
    type: "text";
    text: string;
};
export type ToolUseBlock = {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
};
export type ToolResultBlock = {
    type: "tool_result";
    tool_use_id: string;
    content: string;
    is_error?: boolean;
};
/** A whole turn, the wire shape both Anthropic-compatible APIs and the
 *  gateway used here accept. Tool_use goes out, tool_result comes back in. */
export type AgentMessage = {
    role: "user";
    content: Array<TextBlock | ToolResultBlock>;
} | {
    role: "assistant";
    content: Array<TextBlock | ToolUseBlock>;
};
/** One tool the model may call: a name, a description, and a JSON Schema
 *  for its inputs. The shape the model adapters (Anthropic, gateway) accept. */
export interface AgentTool {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
/** One assistant turn: its content blocks and why it stopped. */
export interface ModelTurn {
    content: Array<TextBlock | ToolUseBlock>;
    /** "tool_use" when the model wants tools run; "end_turn", "max_tokens", …
     *  otherwise. Kept as a string for the same reason: the adapters disagree
     *  about whether they send `null`. */
    stopReason: string | null;
}
export declare const MAX_TURNS = 10;
export declare const BUDGET_MS = 240000;
export declare const TOOL_RESULT_MAX_CHARS = 20000;
/** One remembered turn of a conversation: the text people saw, nothing else. */
export interface ChatMessage {
    role: "user" | "assistant";
    text: string;
}
export interface AgentDeps {
    /** One model call. Throws on a transport / gateway failure — the loop
     *  catches it and turns it into an apology so the caller never sees a
     *  thrown error from the agent. */
    model(req: {
        instructions: string;
        messages: AgentMessage[];
        tools: AgentTool[];
    }): Promise<ModelTurn>;
    /** Runs one tool. Returns an MCP tool result; throws for a tool error. */
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    now?: () => number;
}
export interface AgentResult {
    text: string;
    toolCalls: string[];
    /** Why the loop stopped early, when it did. */
    stopped?: "turns" | "time" | "model_error";
}
export interface RunAgentInput {
    instructions: string;
    history: ChatMessage[];
    message: string;
    tools: AgentTool[];
    limits?: {
        maxTurns?: number;
        budgetMs?: number;
    };
}
/**
 * Fence the instructions into the first user turn. For adapters that drop
 * the top-level `system` field (the gateway used here does, by design) —
 * the loop passes them separately and the adapter chooses the wire shape.
 * The model still sees them as text the first user turn contains.
 */
export declare function fenceInstructions(instructions: string, messages: AgentMessage[]): AgentMessage[];
/**
 * The remembered conversation as alternating `AgentMessage` turns, ending
 * with the new message. Leading assistant turns are dropped and same-role
 * neighbours merged, because the API wants user first and strict alternation
 * — and a conversation saved by an older run might not have it.
 */
export declare function buildMessages(history: ChatMessage[], message: string): AgentMessage[];
/** An MCP tool result (`{ content: [{ type: "text", text }] }`) as the text the model reads. */
export declare function toolResultText(result: unknown): string;
/** Map MCP `tools/list` entries to the shape the model adapters accept. */
export declare function toolsFromMcp(tools: ReadonlyArray<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}>, exclude?: ReadonlySet<string>): AgentTool[];
/** Run the loop. Never throws: a model failure becomes an apology the person can act on. */
export declare function runAgent(input: RunAgentInput, deps: AgentDeps): Promise<AgentResult>;
