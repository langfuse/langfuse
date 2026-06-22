import { describe, it, expect } from "vitest";
import { validateEvaluatorVariableMappings } from "@/src/features/evals/server/unstable-public-api/validation";
import type { PublicEvaluationRuleMappingType } from "@/src/features/public-api/types/unstable-public-evals-contract";

describe("validateEvaluatorVariableMappings", () => {
  it("accepts JSONPath filter expressions in variable mappings", () => {
    // Only `source`, `variable`, and `jsonPath` are read by the validator.
    const mappings = [
      {
        source: "input",
        variable: "query",
        jsonPath: '$[?(@.role=="user")]',
      },
    ] as unknown as PublicEvaluationRuleMappingType[];

    expect(() =>
      validateEvaluatorVariableMappings({
        mappings,
        variables: ["query"],
        target: "observation",
      }),
    ).not.toThrow();
  });
});
