import { EvalTemplateType } from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { McpEvaluatorInput } from "@/src/features/mcp/features/evals/tools/evaluatorInput";

const llmEvaluatorInput = {
  name: "Answer quality",
  type: EvalTemplateType.LLM_AS_JUDGE,
  prompt: "Judge {{output}}",
  outputDefinition: {
    dataType: "NUMERIC",
    reasoning: { description: "Explain the score" },
    score: { description: "Return the score" },
  },
};

describe("MCP evaluator input", () => {
  it("requires provider and model together for custom model configuration", () => {
    const result = McpEvaluatorInput.safeParse({
      ...llmEvaluatorInput,
      modelParams: { temperature: 0.2 },
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["provider"],
          message:
            "Provider and model are required when model configuration is provided.",
        }),
        expect.objectContaining({
          path: ["model"],
          message:
            "Provider and model are required when model configuration is provided.",
        }),
      ]),
    );
  });
});
