import { describe, expect, it } from "vitest";

import { resolveObservationCostSource } from "./ObservationDetailViewHeader";

describe("resolveObservationCostSource", () => {
  it("omits the source for subtree rollups even when totals match", () => {
    expect(
      resolveObservationCostSource({
        hasSubtreeMetrics: true,
        subtreeTotalMatchesObservation: true,
        hasProvidedCostDetails: false,
      }),
    ).toBeUndefined();
  });

  it.each([
    [false, "calculated"],
    [true, "provided"],
  ] as const)(
    "labels a non-subtree observation with provided costs %s as %s",
    (hasProvidedCostDetails, expected) => {
      expect(
        resolveObservationCostSource({
          hasSubtreeMetrics: false,
          subtreeTotalMatchesObservation: false,
          hasProvidedCostDetails,
        }),
      ).toBe(expected);
    },
  );
});
