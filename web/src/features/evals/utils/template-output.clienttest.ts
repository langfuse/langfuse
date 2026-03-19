import {
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
} from "@langfuse/shared";
import { getTemplateResultType } from "./template-output";

describe("getTemplateResultType", () => {
  it("returns Numeric for numeric output definitions", () => {
    expect(
      getTemplateResultType(
        createNumericEvalOutputDefinition({
          reasoningDescription: "Why",
          scoreDescription: "How good",
        }),
      ),
    ).toBe("Numeric");
  });

  it("returns Categorical for categorical output definitions", () => {
    expect(
      getTemplateResultType(
        createCategoricalEvalOutputDefinition({
          reasoningDescription: "Why",
          scoreDescription: "Classification",
          categories: ["correct", "incorrect"],
        }),
      ),
    ).toBe("Categorical");
  });

  it("returns Numeric for legacy output definitions", () => {
    expect(
      getTemplateResultType({
        reasoning: "Why",
        score: "How good",
      }),
    ).toBe("Numeric");
  });

  it("returns Unknown for invalid output definitions", () => {
    expect(getTemplateResultType({ foo: "bar" })).toBe("Unknown");
  });
});
