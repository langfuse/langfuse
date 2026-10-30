// @vitest-environment node

import { describe, expect, it } from "vitest";

import { renderEvaluatorAlertTriggerCondition } from "./renderEvaluatorAlertTriggerCondition";

describe("renderEvaluatorAlertTriggerCondition", () => {
  it("renders a count threshold", () => {
    expect(
      renderEvaluatorAlertTriggerCondition({
        metric: { measure: "count", aggregation: "count" },
        thresholdOperator: "GT",
        alertThreshold: 5,
      }),
    ).toBe("Count > 5");
  });

  it("renders an aggregated measure threshold", () => {
    expect(
      renderEvaluatorAlertTriggerCondition({
        metric: { measure: "value", aggregation: "avg" },
        thresholdOperator: "LTE",
        alertThreshold: 0.5,
      }),
    ).toBe("Avg value ≤ 0.5");
  });
});
