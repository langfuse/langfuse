import { describe, it, expect } from "vitest";
import {
  semanticKernelAdapter,
  selectAdapter,
  SimpleChatMlArraySchema,
  type NormalizerContext,
} from "@langfuse/shared";

const skMetadata = {
  scope: { name: "Microsoft.SemanticKernel.Diagnostics", version: "" },
};

// Test helpers
function normalizeInput(input: unknown, ctx: NormalizerContext = {}) {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? input,
    data: input,
  });
  const preprocessed = adapter.preprocess(input, "input", ctx);
  return SimpleChatMlArraySchema.safeParse(preprocessed);
}

function normalizeOutput(output: unknown, ctx: NormalizerContext = {}) {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? output,
    data: output,
  });
  const preprocessed = adapter.preprocess(output, "output", ctx);
  return SimpleChatMlArraySchema.safeParse(preprocessed);
}

describe("Semantic Kernel Adapter", () => {
  describe("detection", () => {
    it("should detect Semantic Kernel by scope name", () => {
      const ctx: NormalizerContext = {
        metadata: {
          scope: {
            name: "Microsoft.SemanticKernel.Diagnostics",
            version: "",
          },
        },
      };

      expect(semanticKernelAdapter.detect(ctx)).toBe(true);
    });

    it("should detect by framework override", () => {
      expect(
        semanticKernelAdapter.detect({ framework: "semantic-kernel" }),
      ).toBe(true);
    });

    it("should not detect messages with gen_ai.event.content but no scope name", () => {
      // Detection requires scope.name, not just structural pattern
      const input = [
        {
          role: "system",
          "gen_ai.event.content":
            '{"role":"system","name":null,"content":"Today is 2025-12-12T00:00:00.","tool_calls":[]}',
          "gen_ai.system": "openai",
        },
      ];

      expect(semanticKernelAdapter.detect({ data: input })).toBe(false);
    });

    it("should detect with scope name and gen_ai.event.content", () => {
      expect(
        semanticKernelAdapter.detect({
          metadata: skMetadata,
          data: [{ role: "user", "gen_ai.event.content": '{"content":"Hi"}' }],
        }),
      ).toBe(true);
    });

    it("should not detect standard OpenAI format", () => {
      expect(
        semanticKernelAdapter.detect({
          data: { role: "user", content: "Hello" },
        }),
      ).toBe(false);
    });

    it("should not detect MS Agent Framework format with parts", () => {
      expect(
        semanticKernelAdapter.detect({
          data: [
            {
              role: "user",
              parts: [{ type: "text", content: "Hello" }],
            },
          ],
        }),
      ).toBe(false);
    });
  });

  describe("normalization", () => {
    it("should extract content from gen_ai.event.content in input messages", () => {
      // Real format from Semantic Kernel traces (pg.json)
      const metadata = {
        attributes: {
          "gen_ai.operation.name": "chat.completions",
          "gen_ai.system": "openai",
          "gen_ai.request.model": "o4-mini",
        },
        scope: {
          name: "Microsoft.SemanticKernel.Diagnostics",
          version: "",
          attributes: {},
        },
      };

      const input = [
        {
          role: "system",
          "gen_ai.event.content":
            '{"role":"system","name":null,"content":"Today is 2025-12-12T00:00:00.","tool_calls":[]}',
          "gen_ai.system": "openai",
        },
        {
          role: "user",
          "gen_ai.event.content":
            '{"role":"user","name":null,"content":"What is the weather in Portland?","tool_calls":[]}',
          "gen_ai.system": "openai",
        },
      ];

      const result = normalizeInput(input, { metadata });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);

      expect(result.data?.[0].content).toBe("Today is 2025-12-12T00:00:00.");
      expect(result.data?.[0].role).toBe("system");

      expect(result.data?.[1].content).toBe("What is the weather in Portland?");
      expect(result.data?.[1].role).toBe("user");
    });

    it("should extract content from gen_ai.event.content output format with nested message", () => {
      // Semantic Kernel output format wraps content in a message object
      // Real format from pg.json line 73
      const output = {
        "gen_ai.event.content":
          '{"index":0,"message":{"role":"Assistant","name":null,"content":"Based on the analysis, the answer is positive.","tool_calls":[]},"tool_calls":[],"finish_reason":"Stop"}',
      };

      const result = normalizeOutput(output, { metadata: skMetadata });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);

      expect(result.data?.[0].content).toBe(
        "Based on the analysis, the answer is positive.",
      );
      // Role should be normalized to lowercase
      expect(result.data?.[0].role).toBe("assistant");
    });

    it("should extract tool_calls from gen_ai.event.content", () => {
      const input = [
        {
          role: "assistant",
          "gen_ai.event.content":
            '{"role":"assistant","name":null,"content":"","tool_calls":[{"id":"call_abc123","type":"function","function":{"name":"get_weather","arguments":"{\\"location\\":\\"Portland\\"}"}}]}',
          "gen_ai.system": "openai",
        },
      ];

      const result = normalizeInput(input, { metadata: skMetadata });

      expect(result.success).toBe(true);
      expect(result.data?.[0].tool_calls).toBeDefined();
      expect(result.data?.[0].tool_calls).toHaveLength(1);
      expect(result.data?.[0].tool_calls?.[0].id).toBe("call_abc123");
      expect(result.data?.[0].tool_calls?.[0].function?.name).toBe(
        "get_weather",
      );
    });

    it("should strip gen_ai.* fields from output", () => {
      const input = [
        {
          role: "user",
          "gen_ai.event.content":
            '{"role":"user","content":"Hello","tool_calls":[]}',
          "gen_ai.system": "openai",
        },
      ];

      const result = normalizeInput(input, { metadata: skMetadata });

      expect(result.success).toBe(true);
      expect(result.data?.[0]).not.toHaveProperty("gen_ai.event.content");
      expect(result.data?.[0]).not.toHaveProperty("gen_ai.system");
    });

    it("should handle messages without gen_ai.event.content gracefully", () => {
      // If a message doesn't have gen_ai.event.content, pass through cleaned
      const input = [
        {
          role: "user",
          content: "Regular message without OTel wrapping",
        },
      ];

      const result = normalizeInput(input, { framework: "semantic-kernel" });

      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe(
        "Regular message without OTel wrapping",
      );
      expect(result.data?.[0].role).toBe("user");
    });
  });
});
