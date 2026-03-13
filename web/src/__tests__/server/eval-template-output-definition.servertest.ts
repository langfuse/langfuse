/** @jest-environment node */

import { CreateEvalTemplateInputSchema } from "@/src/features/evals/server/router";
import {
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  ScoreDataTypeEnum,
} from "@langfuse/shared";

describe("CreateEvalTemplateInputSchema", () => {
  const baseInput = {
    name: "Accuracy evaluator",
    projectId: "project-1",
    prompt: "Judge {{output}} against {{expected_output}}",
    provider: null,
    model: null,
    modelParams: null,
    vars: ["output", "expected_output"],
  };

  it("accepts versioned categorical output definitions", () => {
    const result = CreateEvalTemplateInputSchema.safeParse({
      ...baseInput,
      outputDefinition: createCategoricalEvalOutputDefinition({
        scoreDescription: "Choose the best matching category",
        reasoningDescription: "Explain the selected category",
        options: [
          { value: "correct", description: "Fully supported" },
          { value: "partial", description: "Mixed or incomplete" },
        ],
      }),
    });

    expect(result.success).toBe(true);
  });

  it("accepts versioned numeric output definitions", () => {
    const result = CreateEvalTemplateInputSchema.safeParse({
      ...baseInput,
      outputDefinition: createNumericEvalOutputDefinition({
        scoreDescription: "Return a score between 0 and 1",
        reasoningDescription: "Explain the assigned score",
      }),
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate categorical values", () => {
    const result = CreateEvalTemplateInputSchema.safeParse({
      ...baseInput,
      outputDefinition: {
        version: 2,
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        reasoning: {
          description: "Explain the selected category",
        },
        score: {
          description: "Choose the best matching category",
          options: [
            { value: "correct", description: "Fully supported" },
            { value: "correct", description: "Conflicting duplicate" },
          ],
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
