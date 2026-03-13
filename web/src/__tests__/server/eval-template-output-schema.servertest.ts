/** @jest-environment node */

import { CreateEvalTemplate } from "@/src/features/evals/server/router";
import {
  createCategoricalEvalTemplateOutputSchema,
  createNumericEvalTemplateOutputSchema,
  EvalTemplateOutputKind,
} from "@langfuse/shared";

describe("CreateEvalTemplate schema", () => {
  const baseInput = {
    name: "Accuracy evaluator",
    projectId: "project-1",
    prompt: "Judge {{output}} against {{expected_output}}",
    provider: null,
    model: null,
    modelParams: null,
    vars: ["output", "expected_output"],
  };

  it("accepts versioned categorical output schemas", () => {
    const result = CreateEvalTemplate.safeParse({
      ...baseInput,
      outputSchema: createCategoricalEvalTemplateOutputSchema({
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

  it("accepts versioned numeric output schemas", () => {
    const result = CreateEvalTemplate.safeParse({
      ...baseInput,
      outputSchema: createNumericEvalTemplateOutputSchema({
        scoreDescription: "Return a score between 0 and 1",
        reasoningDescription: "Explain the assigned score",
      }),
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate categorical values", () => {
    const result = CreateEvalTemplate.safeParse({
      ...baseInput,
      outputSchema: {
        version: 2,
        kind: EvalTemplateOutputKind.CATEGORICAL,
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
