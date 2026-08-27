import { EvalTemplateType } from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  McpEvaluatorInput,
  McpEvaluatorInputBase,
} from "@/src/features/mcp/features/evals/tools/evaluatorInput";

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
  it("exposes model configuration as an optional object without unions", () => {
    const schema = z.toJSONSchema(McpEvaluatorInputBase);
    const modelConfig = schema.properties?.modelConfig;

    expect(modelConfig).toMatchObject({
      type: "object",
      required: ["provider", "model"],
    });
    expect(modelConfig).not.toHaveProperty("anyOf");
    expect(modelConfig).not.toHaveProperty("oneOf");
  });

  it("reuses the observation variable mapping schema", () => {
    expect(
      McpEvaluatorInput.safeParse({
        ...llmEvaluatorInput,
        variableMapping: [
          {
            templateVariable: "output",
            selectedColumnId: "output",
            jsonSelector: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("validates custom model configuration through its schema", () => {
    const incomplete = McpEvaluatorInput.safeParse({
      ...llmEvaluatorInput,
      modelConfig: { modelParams: { temperature: 0.2 } },
    });

    expect(incomplete.success).toBe(false);
    if (!incomplete.success) {
      expect(incomplete.error.issues.map(({ path }) => path)).toEqual(
        expect.arrayContaining([
          ["modelConfig", "provider"],
          ["modelConfig", "model"],
        ]),
      );
    }

    expect(
      McpEvaluatorInput.safeParse({
        ...llmEvaluatorInput,
        modelConfig: {
          provider: "openai",
          model: "gpt-4.1-mini",
          modelParams: { temperature: 0.2 },
        },
      }).success,
    ).toBe(true);
  });
});
