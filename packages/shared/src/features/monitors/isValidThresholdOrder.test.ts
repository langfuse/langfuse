import { describe, it, expect } from "vitest";

import { isValidThresholdOrder } from "./isValidThresholdOrder";

describe("isValidThresholdOrder", () => {
  it.each(["GT", "GTE"] as const)(
    "%s requires warningThreshold < alertThreshold",
    (op) => {
      expect(
        isValidThresholdOrder({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 50,
        }),
      ).toEqual({ valid: true });
      const equal = isValidThresholdOrder({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 100,
      });
      expect(equal.valid).toBe(false);
      if (!equal.valid) expect(equal.reason).toContain(">");
      const higher = isValidThresholdOrder({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 200,
      });
      expect(higher.valid).toBe(false);
      if (!higher.valid) expect(higher.reason).toContain(">");
    },
  );

  it.each(["LT", "LTE"] as const)(
    "%s requires warningThreshold > alertThreshold",
    (op) => {
      expect(
        isValidThresholdOrder({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 200,
        }),
      ).toEqual({ valid: true });
      const equal = isValidThresholdOrder({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 100,
      });
      expect(equal.valid).toBe(false);
      if (!equal.valid) expect(equal.reason).toContain("<");
      const lower = isValidThresholdOrder({
        thresholdOperator: op,
        alertThreshold: 100,
        warningThreshold: 50,
      });
      expect(lower.valid).toBe(false);
      if (!lower.valid) expect(lower.reason).toContain("<");
    },
  );

  it.each(["EQ", "NEQ"] as const)("%s passes regardless of ordering", (op) => {
    for (const warning of [50, 100, 200]) {
      expect(
        isValidThresholdOrder({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: warning,
        }),
      ).toEqual({ valid: true });
    }
  });

  it.each(["GT", "GTE", "LT", "LTE", "EQ", "NEQ"] as const)(
    "%s passes when warningThreshold is null",
    (op) => {
      expect(
        isValidThresholdOrder({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: null,
        }),
      ).toEqual({ valid: true });
    },
  );
});
