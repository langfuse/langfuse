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
    // Tool calls should be in validated tool_calls field with flat format
    const toolCalls = result.data[1].tool_calls;
    expect(toolCalls).toBeDefined();
    expect(toolCalls?.[0].id).toBe("call_abc");
    expect(toolCalls?.[0].name).toBe("Web-Search");
    expect(toolCalls?.[0].arguments).toBe('{"query":"example"}');

    expect(result.data[2].role).toBe("tool");
    expect(typeof result.data[2].content).toBe("string");
    expect(result.data[2].content).toBe(
      '{"temperature":72,"conditions":"sunny"}',
    );
  });

  it("should filter out tool definitions and attach them to messages", () => {
    // This is the format from langgraph-2025-08-22.json
    const input = [
      {
        role: "user",
        content: "Be helpful!",
      },
      {
        role: "user",
        content: "Search the web for 'example' and summarize.",
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "Web-Search",
            description: "Dummy web search tool.",
            parameters: {
              properties: {
                query: {
                  type: "string",
                },
              },
              required: ["query"],
              type: "object",
            },
          },
        },
      },
    ];

    const result = normalizeInput(input, { framework: "langgraph" });
    expect(result.success).toBe(true);

    // Tool definition should be filtered out
    expect(result.data).toHaveLength(2);

    // Both messages should have tools attached
    expect(result.data?.[0].role).toBe("user");
    expect(result.data?.[0].content).toBe("Be helpful!");
    expect(result.data?.[0].tools).toBeDefined();
    expect(result.data?.[0].tools?.[0].name).toBe("Web-Search");
    expect(result.data?.[0].tools?.[0].description).toBe(
      "Dummy web search tool.",
    );

    expect(result.data?.[1].role).toBe("user");
    expect(result.data?.[1].content).toBe(
      "Search the web for 'example' and summarize.",
    );
    expect(result.data?.[1].tools).toBeDefined();
    expect(result.data?.[1].tools?.[0].name).toBe("Web-Search");
  });

  it("should clean up additional_kwargs with null values", () => {
    const output = {
      role: "assistant",
      content: "",
      additional_kwargs: {
        tool_calls: [
          {
            id: "call_123",
            function: {
              name: "Web-Search",
              arguments: { query: "example" },
            },
            type: "function",
          },
        ],
        refusal: null,
      },
    };

    const result = normalizeInput(output, { framework: "langgraph" });
    expect(result.success).toBe(true);

    // Tool calls should be extracted and flattened
    expect(result.data?.[0].tool_calls).toBeDefined();
    expect(result.data?.[0].tool_calls?.[0].name).toBe("Web-Search");
    expect(result.data?.[0].tool_calls?.[0].arguments).toBe(
      '{"query":"example"}',
    );

    // additional_kwargs should be removed entirely (only had tool_calls and null refusal)
    expect(result.data?.[0].json?.json?.additional_kwargs).toBeUndefined();
  });

  it("should not mutate original object during normalization", () => {
    const additionalKwargs = {
      tool_calls: [{ id: "call_123", function: { name: "Web-Search" } }],
    };
    const output = {
      role: "assistant",
      content: "",
      additional_kwargs: additionalKwargs,
    };

    normalizeInput(output, { framework: "langgraph" });

    // Original must be unchanged (JSON view depends on it)
    expect(additionalKwargs).toEqual({
      tool_calls: [{ id: "call_123", function: { name: "Web-Search" } }],
    });
  });

  it("should filter tool definitions from google vertex langchain trace", () => {
    // Format from google-vertex-tools-langchain-2025-09-19.json
    const input = [
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      {
        role: "user",
        content: "Hello, I'm interested in learning more.",
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "transition_to_service_a",
            description: "Transition to Service A",
            parameters: {
              properties: {
                reason: {
                  description: "Reason for transition",
                  type: "string",
                },
              },
              required: ["reason"],
              type: "object",
            },
          },
        },
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "get_customer_info",
            description: "Retrieve customer info",
            parameters: {
              type: "object",
              properties: {
                customer_id: {
                  type: "string",
                },
              },
            },
          },
        },
      },
      {
        role: "assistant",
        content: "How can I help you today?",
      },
    ];

    const ctx = {
      metadata: {
        ls_provider: "google_vertexai",
      },
    };

    const result = normalizeInput(input, ctx);

    expect(result.success).toBe(true);

    // Tool definitions should be filtered out - only 3 messages remain
    expect(result.data).toHaveLength(3);

    // Check no tool definition messages remain
    const toolMessages = result.data?.filter((msg: any) => msg.role === "tool");
    expect(toolMessages).toHaveLength(0);

    // Tools should be attached to messages
    expect(result.data?.[0].tools).toBeDefined();
    expect(result.data?.[0].tools).toHaveLength(2);
    expect(result.data?.[0].tools?.[0].name).toBe("transition_to_service_a");
    expect(result.data?.[0].tools?.[1].name).toBe("get_customer_info");
  });
});
