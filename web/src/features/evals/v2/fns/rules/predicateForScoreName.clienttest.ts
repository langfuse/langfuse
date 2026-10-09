import { describe, expect, it } from "vitest";

import { predicateForScoreName } from "@/src/features/evals/v2/fns/rules/predicateForScoreName";

describe("predicateForScoreName", () => {
  it("rebuilds the predicate with the selected score definition", () => {
    expect(
      predicateForScoreName("verdict", [
        {
          name: "confidence",
          dataType: "NUMERIC",
          minValue: 0.25,
          maxValue: 1,
        },
        {
          name: "verdict",
          dataType: "CATEGORICAL",
          allowedValues: ["pass", "fail"],
        },
      ]),
    ).toEqual({
      scoreName: "verdict",
      dataType: "CATEGORICAL",
      operator: "=",
      value: "pass",
    });
  });
});
