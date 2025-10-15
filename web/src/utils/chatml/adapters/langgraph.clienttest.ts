jest.mock("@langfuse/shared", () => ({
  ChatMessageRole: {
    System: "system",
    Developer: "developer",
    User: "user",
    Assistant: "assistant",
    Tool: "tool",
    Model: "model",
  },
}));

import { normalizeInput } from "./index";
import { langgraphAdapter } from "./langgraph";

describe("LangGraph Adapter", () => {
  it("should detect LangGraph via various metadata patterns", () => {
    expect(
      langgraphAdapter.detect({
        metadata: { langgraph_node: "agent", langgraph_step: 3 },
      }),
    ).toBe(true);

    expect(
      langgraphAdapter.detect({ metadata: { framework: "langgraph" } }),
    ).toBe(true);

    expect(langgraphAdapter.detect({ framework: "langgraph" })).toBe(true);

    expect(
      langgraphAdapter.detect({
        metadata: {
          messages: [
            { type: "human", content: "Hello" },
            { type: "ai", content: "Hi" },
          ],
        },
      }),
    ).toBe(true);

    expect(
      langgraphAdapter.detect({
        metadata: { scope: { name: "langfuse-sdk" } },
      }),
    ).toBe(false);
  });

  it("should normalize LangGraph messages with type-to-role conversion and tool_calls", () => {
    const input = {
      messages: [
        {
          content: "Search the web",
          type: "human",
          id: "msg-1",
          name: null,
        },
        {
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_abc",
                type: "function",
                function: {
                  name: "Web-Search",
                  arguments: { query: "example" },
                },
              },
            ],
          },
          type: "ai",
          id: "run-123",
        },
        {
          content: { temperature: 72, conditions: "sunny" },
          type: "tool",
          name: "Web-Search",
          tool_call_id: "call_abc",
        },
      ],
    };

    const result = normalizeInput(input, { framework: "langgraph" });
    expect(result.success).toBe(true);
    if (!result.data) throw new Error("Expected data to be defined");

    expect(result.data).toHaveLength(3);
    expect(result.data[0].role).toBe("user");
    expect(result.data[0].content).toBe("Search the web");
    expect(result.data[0].json?.json?._originalType).toBe("human");

    expect(result.data[1].role).toBe("assistant");
    expect(result.data[1].json?.json?._originalType).toBe("ai");
    const toolCalls = result.data[1].json?.json?.tool_calls;
    expect(toolCalls).toBeDefined();
    expect(toolCalls?.[0].id).toBe("call_abc");
    expect(toolCalls?.[0].function.arguments).toEqual({ query: "example" });

    expect(result.data[2].role).toBe("tool");
    expect(typeof result.data[2].content).toBe("string");
    expect(result.data[2].content).toBe(
      '{"temperature":72,"conditions":"sunny"}',
    );
  });
});
