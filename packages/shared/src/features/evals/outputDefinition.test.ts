import { describe, expect, it } from "vitest";
import {
  EvalOutputDefinitionSchema,
  PersistedEvalOutputDefinitionSchema,
} from "./outputDefinition";

describe("evaluator output definitions", () => {
  it("uses the same versionless shape in the service and persistence", () => {
    const definition = EvalOutputDefinitionSchema.parse({
      dataType: "BOOLEAN",
      reasoning: { description: "Why the verdict was selected" },
      score: { description: "Whether the input passes" },
    });

    expect(PersistedEvalOutputDefinitionSchema.parse(definition)).toEqual(
      definition,
    );
    expect(definition).not.toHaveProperty("version");
  });

  it("defaults omitted score descriptions", () => {
    expect(
      EvalOutputDefinitionSchema.parse({
        dataType: "NUMERIC",
        reasoning: {},
        score: { minValue: 0, maxValue: 1 },
      }),
    ).toEqual({
      dataType: "NUMERIC",
      reasoning: { description: "" },
      score: { description: "", minValue: 0, maxValue: 1 },
    });
  });

  it("continues to read existing definitions that contain a version", () => {
    expect(
      PersistedEvalOutputDefinitionSchema.parse({
        version: 2,
        dataType: "BOOLEAN",
        reasoning: { description: "Why the verdict was selected" },
        score: { description: "Whether the input passes" },
      }),
    ).toEqual({
      dataType: "BOOLEAN",
      reasoning: { description: "Why the verdict was selected" },
      score: { description: "Whether the input passes" },
    });
  });

  it("applies categorical validation before persistence", () => {
    expect(
      EvalOutputDefinitionSchema.safeParse({
        dataType: "CATEGORICAL",
        reasoning: { description: "Why the category was selected" },
        score: {
          description: "Selected category",
          categories: ["duplicate", "duplicate"],
          shouldAllowMultipleMatches: false,
        },
      }).success,
    ).toBe(false);
  });
});
