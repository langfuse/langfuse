import { describe, expect, it } from "vitest";
import type { Organization } from "@prisma/client";

import { getBillingCycleStart, getDaysToLookBack } from "./billingCycleHelpers";

describe("getDaysToLookBack", () => {
  it.each([
    ["2023-03-29T12:00:00.000Z", "2023-01-31T00:00:00.000Z", 29],
    ["2023-03-30T12:00:00.000Z", "2023-01-31T00:00:00.000Z", 30],
    ["2024-03-30T12:00:00.000Z", "2024-01-31T00:00:00.000Z", 30],
  ])(
    "includes the billing cycle start for %s with anchor %s",
    (reference, anchor, expectedDays) => {
      const referenceDate = new Date(reference);
      const anchorDate = new Date(anchor);
      const org = {
        cloudBillingCycleAnchor: anchorDate,
        createdAt: anchorDate,
      } as Organization;
      const cycleStart = getBillingCycleStart(org, referenceDate);
      const daysAgo = Math.floor(
        (Date.UTC(
          referenceDate.getUTCFullYear(),
          referenceDate.getUTCMonth(),
          referenceDate.getUTCDate(),
        ) -
          cycleStart.getTime()) /
          86_400_000,
      );

      expect(daysAgo).toBe(expectedDays);
      expect(getDaysToLookBack(referenceDate)).toBeGreaterThanOrEqual(daysAgo);
    },
  );

  it.each([
    ["2023-03-31T12:00:00.000Z", 28],
    ["2024-03-31T12:00:00.000Z", 29],
    ["2024-05-31T12:00:00.000Z", 30],
  ])("keeps the prior lookback on the final day %s", (reference, days) => {
    expect(getDaysToLookBack(new Date(reference))).toBe(days);
  });
});
