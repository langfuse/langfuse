import { describe, it, expect } from "vitest";
import {
  ag2Adapter,
  selectAdapter,
  normalizeInput,
  SimpleChatMlArraySchema,
  type NormalizerContext,
} from "@langfuse/shared";

describe("AG2 Adapter", () => {
  describe("detection", () => {
    it("should detect AG2 via scope.name containing autogen", () => {
      expect(
        ag2Adapter.detect({
          metadata: {
            scope: {
              name: "autogen.opentelemetry",
              version: "0.11.2",
            },
          },
        }),
      ).toBe(true);
    });

    it("should detect AG2 via scope.name containing ag2", () => {
      expect(
        ag2Adapter.detect({
          metadata: {
            scope: {
              name: "ag2.tracing",
            },
          },
        }),
      ).toBe(true);
    });

    it("should detect AG2 via ag2.span.type attribute", () => {
      expect(
        ag2Adapter.detect({
          metadata: {
            attributes: {
              "ag2.span.type": "conversation",
            },
          },
        }),
      ).toBe(true);
    });

    it("should detect AG2 via ag2-prefixed attributes", () => {
      expect(
        ag2Adapter.detect({
          metadata: {
            attributes: {
              "ag2.agent.name": "assistant",
            },
          },
        }),
      ).toBe(true);
    });

    it("should detect AG2 via explicit framework override", () => {
      expect(ag2Adapter.detect({ framework: "ag2" })).toBe(true);
      expect(ag2Adapter.detect({ framework: "autogen" })).toBe(true);
    });

    it("should detect AG2 via observation name patterns", () => {
      expect(
        ag2Adapter.detect({ observationName: "conversation user_proxy" }),
      ).toBe(true);
      expect(
        ag2Adapter.detect({ observationName: "invoke_agent assistant" }),
      ).toBe(true);
      expect(
        ag2Adapter.detect({ observationName: "execute_tool get_weather" }),
      ).toBe(true);
      expect(
        ag2Adapter.detect({ observationName: "execute_code assistant" }),
      ).toBe(true);
      expect(
        ag2Adapter.detect({
          observationName: "await_human_input user_proxy",
        }),
      ).toBe(true);
      expect(ag2Adapter.detect({ observationName: "speaker_selection" })).toBe(
        true,
      );
    });

    it("should NOT detect unrelated frameworks", () => {
      expect(
        ag2Adapter.detect({
          metadata: { scope: { name: "langfuse-sdk" } },
        }),
      ).toBe(false);

      expect(
        ag2Adapter.detect({
          metadata: { scope: { name: "ai" } },
        }),
      ).toBe(false);

      expect(
        ag2Adapter.detect({
          metadata: { scope: { name: "pydantic-ai" } },
        }),
      ).toBe(false);

      expect(
        ag2Adapter.detect({
          metadata: { langgraph_node: "agent" },
        }),
      ).toBe(false);
    });

    it("should NOT detect generic observation names", () => {
      expect(ag2Adapter.detect({ observationName: "chat gpt-4o-mini" })).toBe(
        false,
      );

      expect(ag2Adapter.detect({ observationName: "my-agent" })).toBe(false);
    });

    it("should detect AG2 via stringified metadata", () => {
      expect(
        ag2Adapter.detect({
          metadata: JSON.stringify({
            scope: { name: "autogen.opentelemetry" },
          }),
        }),
      ).toBe(true);
    });
  });

  describe("selectAdapter routing", () => {
    it("should select AG2 adapter for AG2 traces via scope.name", () => {
      const adapter = selectAdapter({
        metadata: {
          scope: {
            name: "autogen.opentelemetry",
            version: "0.11.2",
          },
        },
      });
      expect(adapter.id).toBe("ag2");
    });

    it("should select AG2 adapter for AG2 traces via ag2.span.type", () => {
      const adapter = selectAdapter({
        metadata: {
          attributes: {
            "ag2.span.type": "llm",
            "gen_ai.system": "openai",
          },
        },
      });
      expect(adapter.id).toBe("ag2");
    });

    it("should NOT select AG2 adapter for LangGraph traces", () => {
      const adapter = selectAdapter({
        metadata: {
          langgraph_node: "agent",
          langgraph_step: 3,
        },
      });
      expect(adapter.id).not.toBe("ag2");
    });
  });

  describe("preprocessing", () => {
    it("should normalize OpenAI-style messages with nested tool_calls", () => {
      const input = [
        {
          role: "system",
          content: "You are a helpful weather assistant.",
        },
        {
          role: "user",
          content: "What is the weather in San Francisco?",
        },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_abc123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"location": "San Francisco, CA"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_abc123",
          content: '{"temperature": 62, "condition": "Partly Cloudy"}',
        },
      ];

      const ctx: NormalizerContext = {
        metadata: {
          scope: { name: "autogen.opentelemetry" },
          attributes: { "ag2.span.type": "agent" },
        },
        data: input,
      };

      const adapter = selectAdapter(ctx);
      expect(adapter.id).toBe("ag2");

      const preprocessed = adapter.preprocess(input, "input", ctx);
      const result = SimpleChatMlArraySchema.safeParse(preprocessed);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(4);

      // System message
      expect(result.data?.[0].role).toBe("system");
      expect(result.data?.[0].content).toBe(
        "You are a helpful weather assistant.",
      );

      // User message
      expect(result.data?.[1].role).toBe("user");

      // Assistant message with tool calls (flattened)
      expect(result.data?.[2].role).toBe("assistant");
      expect(result.data?.[2].tool_calls).toBeDefined();
      expect(result.data?.[2].tool_calls?.[0].id).toBe("call_abc123");
      expect(result.data?.[2].tool_calls?.[0].name).toBe("get_weather");
      expect(result.data?.[2].tool_calls?.[0].arguments).toBe(
        '{"location": "San Francisco, CA"}',
      );

      // Tool response
      expect(result.data?.[3].role).toBe("tool");
    });

    it("should stringify object tool result content", () => {
      const input = [
        {
          role: "tool",
          tool_call_id: "call_xyz",
          content: { temperature: 72, conditions: "sunny" },
        },
      ];

      const preprocessed = ag2Adapter.preprocess(input, "output", {});
      const result = SimpleChatMlArraySchema.safeParse(preprocessed);

      expect(result.success).toBe(true);
      expect(result.data?.[0].role).toBe("tool");
      expect(result.data?.[0].content).toBe(
        '{"temperature":72,"conditions":"sunny"}',
      );
    });

    it("should handle messages wrapped in object with messages key", () => {
      const input = {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
      };

      const preprocessed = ag2Adapter.preprocess(input, "input", {});
      expect(preprocessed).toHaveProperty("messages");

      const messages = (preprocessed as { messages: unknown[] }).messages;
      expect(messages).toHaveLength(2);
    });

    it("should handle single message by wrapping in array", () => {
      const input = { role: "user", content: "Hello" };

      const preprocessed = ag2Adapter.preprocess(input, "input", {});
      expect(Array.isArray(preprocessed)).toBe(true);
      expect(preprocessed).toHaveLength(1);
    });

    it("should handle tool_calls with already-flat format", () => {
      const input = [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              name: "search",
              arguments: { query: "test" },
              type: "function",
            },
          ],
        },
      ];

      const preprocessed = ag2Adapter.preprocess(input, "output", {});
      const result = SimpleChatMlArraySchema.safeParse(preprocessed);

      expect(result.success).toBe(true);
      expect(result.data?.[0].tool_calls?.[0].name).toBe("search");
      expect(result.data?.[0].tool_calls?.[0].arguments).toBe(
        '{"query":"test"}',
      );
    });

    it("should pass through null/undefined data unchanged", () => {
      expect(ag2Adapter.preprocess(null, "input", {})).toBeNull();
      expect(ag2Adapter.preprocess(undefined, "input", {})).toBeUndefined();
    });
  });

  describe("end-to-end with normalizeInput", () => {
    it("should normalize AG2 multi-agent trace input through full pipeline", () => {
      const input = [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: "What is the capital of France?",
        },
        {
          role: "assistant",
          content: "The capital of France is Paris.",
        },
      ];

      const ctx: NormalizerContext = {
        metadata: {
          scope: { name: "autogen.opentelemetry", version: "0.11.2" },
          attributes: { "ag2.span.type": "agent" },
        },
        data: input,
      };

      const result = normalizeInput(input, ctx);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data?.[0].role).toBe("system");
      expect(result.data?.[1].role).toBe("user");
      expect(result.data?.[2].role).toBe("assistant");
      expect(result.data?.[2].content).toBe("The capital of France is Paris.");
    });

    it("should normalize AG2 tool execution trace through full pipeline", () => {
      const input = [
        {
          role: "system",
          content: "Use the get_weather tool to answer weather questions.",
        },
        {
          role: "user",
          content: "What is the weather in San Francisco?",
        },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_abc123",
              function: {
                name: "get_weather",
                arguments: '{"location": "San Francisco, CA"}',
              },
              type: "function",
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_abc123",
          content:
            '{"location": "San Francisco, CA", "temperature_f": 62, "condition": "Partly Cloudy"}',
        },
      ];

      const ctx: NormalizerContext = {
        metadata: {
          scope: { name: "autogen.opentelemetry", version: "0.11.2" },
          attributes: {
            "ag2.span.type": "agent",
            "ag2.agent.name": "assistant",
          },
        },
        data: input,
      };

      const result = normalizeInput(input, ctx);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(4);

      // Verify tool call was flattened properly
      const assistantMsg = result.data?.[2];
      expect(assistantMsg?.role).toBe("assistant");
      expect(assistantMsg?.tool_calls).toHaveLength(1);
      expect(assistantMsg?.tool_calls?.[0].name).toBe("get_weather");
      expect(assistantMsg?.tool_calls?.[0].id).toBe("call_abc123");

      // Verify tool response
      const toolMsg = result.data?.[3];
      expect(toolMsg?.role).toBe("tool");
    });
  });
});
