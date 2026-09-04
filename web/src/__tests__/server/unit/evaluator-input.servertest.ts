import { EvalTemplateType } from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  McpEvaluatorInput,
  McpEvaluatorInputBase,
} from "@/src/features/mcp/server/evals/tools/evaluatorInput";

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

const hasJsonSchemaComposition = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return value.some(hasJsonSchemaComposition);

  const schema = value as Record<string, unknown>;
  if (
    Array.isArray(schema.anyOf) ||
    Array.isArray(schema.oneOf) ||
    Array.isArray(schema.allOf)
  ) {
    return true;
  }

  return Object.values(schema).some(hasJsonSchemaComposition);
};

describe("MCP evaluator input", () => {
  it("exposes a plain JSON schema without unions or intersections", () => {
    const schema = z.toJSONSchema(McpEvaluatorInputBase, {
      target: "draft-7",
      unrepresentable: "any",
    });

    expect(schema.properties?.modelConfig).toMatchObject({
      type: "object",
      required: ["provider", "model"],
    });
    expect(schema.properties?.outputDefinition).toMatchObject({
      type: "object",
      required: ["dataType", "reasoning", "score"],
      properties: {
        dataType: {
          type: "string",
          enum: ["NUMERIC", "CATEGORICAL", "BOOLEAN"],
        },
        reasoning: {
          type: "object",
          properties: {
            description: { type: "string" },
          },
        },
        score: {
          type: "object",
          properties: {
            description: { type: "string" },
            minValue: { type: "number" },
            maxValue: { type: "number" },
            categories: {
              type: "array",
              items: { type: "string" },
            },
            shouldAllowMultipleMatches: { type: "boolean" },
          },
        },
      },
    });
    expect(hasJsonSchemaComposition(schema)).toBe(false);
  });

  it.each([undefined, "", "   "])(
    "requires a non-empty prompt for LLM-as-a-judge evaluators",
    (prompt) => {
      const result = McpEvaluatorInput.safeParse({
        ...llmEvaluatorInput,
        prompt,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: ["prompt"],
            message: "Prompt is required for LLM-as-a-judge evaluators.",
          }),
        );
      }
    },
  );

  it("derives a plain variable mapping schema from the shared schema", () => {
    expect(
      McpEvaluatorInput.safeParse({
        ...llmEvaluatorInput,
        variableMapping: [
          {
            templateVariable: "output",
            selectedColumnId: "output",
            jsonSelector: "$.answer",
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
          modelParams: {
            temperature: 0.2,
            providerOptions: { openai: { reasoningEffort: "low" } },
          },
        },
      }).success,
    ).toBe(true);
  });
});
