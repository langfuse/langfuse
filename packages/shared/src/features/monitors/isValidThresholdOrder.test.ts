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
      ).toBe(true);
      expect(
        isValidThresholdOrder({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 100, // equal → invalid
        }),
      ).toBe(false);
      expect(
        isValidThresholdOrder({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 200, // warning > alert → invalid for gt
        }),
      ).toBe(false);
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
      ).toBe(true);
      expect(
        isValidThresholdOrder({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 100,
        }),
      ).toBe(false);
      expect(
        isValidThresholdOrder({
          thresholdOperator: op,
          alertThreshold: 100,
          warningThreshold: 50,
        }),
      ).toBe(false);
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
      ).toBe(true);
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
      ).toBe(true);
    },
  );
});
