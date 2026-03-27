/** @jest-environment node */

import { CreateEvalTemplateInputSchema } from "@/src/features/evals/server/router";
import {
  createBooleanEvalOutputDefinition,
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
        categories: ["correct", "partial"],
      }),
    });

    expect(result.success).toBe(true);
  });

  it("accepts versioned categorical multi-match output definitions", () => {
    const result = CreateEvalTemplateInputSchema.safeParse({
      ...baseInput,
      outputDefinition: createCategoricalEvalOutputDefinition({
        scoreDescription: "Choose all matching categories",
        reasoningDescription: "Explain the selected categories",
        categories: ["correct", "partial"],
        shouldAllowMultipleMatches: true,
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

  it("accepts versioned boolean output definitions", () => {
    const result = CreateEvalTemplateInputSchema.safeParse({
      ...baseInput,
      outputDefinition: createBooleanEvalOutputDefinition({
        scoreDescription:
          "Return true if the answer satisfies the criteria, otherwise false",
        reasoningDescription: "Explain the verdict",
      }),
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate categories", () => {
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
          categories: ["correct", "correct"],
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate categories after trimming whitespace", () => {
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
          categories: ["correct", " correct "],
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects blank categorical entries", () => {
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
          categories: ["correct", "   "],
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects categorical outputs with fewer than two categories", () => {
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
          categories: ["correct"],
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
