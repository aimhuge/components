import { describe, expect, it, vi } from "vitest";
import {
  BUDGET_MS,
  MAX_TURNS,
  TOOL_RESULT_MAX_CHARS,
  type AgentMessage,
  type AgentTool,
  type ModelTurn,
  buildMessages,
  fenceInstructions,
  runAgent,
  toolResultText,
  toolsFromMcp,
} from "../server/agent/loop";

const text = (t: string): ModelTurn => ({ content: [{ type: "text", text: t }], stopReason: "end_turn" });
const use = (id: string, name: string, input: Record<string, unknown> = {}): ModelTurn => ({
  content: [{ type: "text", text: "Looking." }, { type: "tool_use", id, name, input }],
  stopReason: "tool_use",
});
const mcpResult = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

describe("buildMessages", () => {
  it("drops a leading assistant turn and merges neighbours so turns alternate, user first", () => {
    const m = buildMessages(
      [
        { role: "assistant", text: "stale" },
        { role: "user", text: "one" },
        { role: "user", text: "two" },
        { role: "assistant", text: "answer" },
      ],
      "three",
    );
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m[0]?.content[0]).toEqual({ type: "text", text: "one\n\ntwo" });
    expect(m[2]?.content[0]).toEqual({ type: "text", text: "three" });
  });
});

describe("toolResultText", () => {
  it("reads an MCP result's text blocks", () => expect(toolResultText(mcpResult({ a: 1 }))).toBe('{"a":1}'));
  it("caps a huge result and says how to ask for less", () => {
    const out = toolResultText({ content: [{ type: "text", text: "x".repeat(TOOL_RESULT_MAX_CHARS + 50) }] });
    expect(out.length).toBeLessThan(TOOL_RESULT_MAX_CHARS + 200);
    expect(out).toContain("Ask for less");
  });
});

describe("fenceInstructions", () => {
  it("fences instructions into the first user turn", () => {
    const msgs: AgentMessage[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
    const out = fenceInstructions("RULES", msgs);
    expect(out[0]?.content[0]).toEqual({ type: "text", text: "<instructions>\nRULES\n</instructions>" });
    expect(out[0]?.content[1]).toEqual({ type: "text", text: "hi" });
  });

  it("is a no-op when there's no first user turn", () => {
    const msgs: AgentMessage[] = [{ role: "assistant", content: [{ type: "text", text: "hi" }] }];
    expect(fenceInstructions("RULES", msgs)).toBe(msgs);
  });

  it("is a no-op when the instructions are empty", () => {
    const msgs: AgentMessage[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
    expect(fenceInstructions("   ", msgs)).toBe(msgs);
  });
});

describe("toolsFromMcp", () => {
  it("maps tools/list entries to AgentTool", () => {
    const out = toolsFromMcp([
      { name: "list_posts", description: "List posts", inputSchema: { type: "object" } },
      { name: "schedule_post", description: "Schedule", inputSchema: { type: "object", properties: {} } },
    ]);
    expect(out).toEqual<AgentTool[]>([
      { name: "list_posts", description: "List posts", input_schema: { type: "object" } },
      { name: "schedule_post", description: "Schedule", input_schema: { type: "object", properties: {} } },
    ]);
  });

  it("honours the exclude set", () => {
    const out = toolsFromMcp(
      [
        { name: "a", description: "A", inputSchema: {} },
        { name: "b", description: "B", inputSchema: {} },
      ],
      new Set(["b"]),
    );
    expect(out.map((t) => t.name)).toEqual(["a"]);
  });
});

describe("runAgent", () => {
  const base = { instructions: "RULES", history: [], message: "schedule my post", tools: [] };

  it("passes instructions SEPARATELY — they do not appear in the messages", async () => {
    const model = vi.fn().mockResolvedValue(text("hi"));
    await runAgent(base, { model, callTool: vi.fn() });
    const req = model.mock.calls[0]![0];
    expect(req.instructions).toBe("RULES");
    const firstMsg = req.messages[0] as AgentMessage;
    expect(firstMsg.content[0]).toEqual({ type: "text", text: "schedule my post" });
  });

  it("runs the tools the model asks for and returns its final words", async () => {
    const model = vi.fn().mockResolvedValueOnce(use("t1", "list_posts", { status: "draft" })).mockResolvedValueOnce(text("Scheduled."));
    const callTool = vi.fn().mockResolvedValue(mcpResult({ posts: [] }));
    const result = await runAgent(base, { model, callTool });

    expect(result).toEqual({ text: "Scheduled.", toolCalls: ["list_posts"] });
    expect(callTool).toHaveBeenCalledWith("list_posts", { status: "draft" });
    const second = model.mock.calls[1]![0].messages as AgentMessage[];
    expect(second.at(-1)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: '{"posts":[]}' }],
    });
  });

  it("hands a tool error back to the model instead of throwing", async () => {
    const model = vi.fn().mockResolvedValueOnce(use("t1", "schedule_post")).mockResolvedValueOnce(text("Fixed it."));
    const callTool = vi.fn().mockRejectedValue(new Error("Not a member of workspace acme"));
    const result = await runAgent(base, { model, callTool });
    expect(result.text).toBe("Fixed it.");
    const results = (model.mock.calls[1]![0].messages as AgentMessage[]).at(-1);
    expect(results?.content[0]).toMatchObject({ is_error: true, content: "Not a member of workspace acme" });
  });

  it("stops after MAX_TURNS model calls", async () => {
    const model = vi.fn().mockResolvedValue(use("t", "get_post"));
    const result = await runAgent(base, { model, callTool: vi.fn().mockResolvedValue(mcpResult({})) });
    expect(model).toHaveBeenCalledTimes(MAX_TURNS);
    expect(result.stopped).toBe("turns");
  });

  it("respects an override on maxTurns", async () => {
    const model = vi.fn().mockResolvedValue(use("t", "get_post"));
    const result = await runAgent({ ...base, limits: { maxTurns: 3 } }, { model, callTool: vi.fn().mockResolvedValue(mcpResult({})) });
    expect(model).toHaveBeenCalledTimes(3);
    expect(result.stopped).toBe("turns");
  });

  it("stops when the wall-clock budget is spent", async () => {
    let t = 0;
    const model = vi.fn().mockImplementation(async () => {
      t += BUDGET_MS / 2 + 1;
      return use("t", "get_post");
    });
    const result = await runAgent(base, { model, callTool: vi.fn().mockResolvedValue(mcpResult({})), now: () => t });
    expect(result.stopped).toBe("time");
    expect(result.text).toContain("Looking.");
  });

  it("turns a model outage into words, not a throw", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runAgent(base, { model: vi.fn().mockRejectedValue(new Error("502")), callTool: vi.fn() });
    expect(result.stopped).toBe("model_error");
    expect(result.text).toContain("nothing was changed");
  });
});