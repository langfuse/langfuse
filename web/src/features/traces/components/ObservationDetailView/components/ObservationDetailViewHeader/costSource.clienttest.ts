import { describe, expect, it } from "vitest";

import { resolveObservationCostSource } from "./costSource";

describe("resolveObservationCostSource", () => {
  it("omits the source for subtree rollups", () => {
    expect(
      resolveObservationCostSource({
        hasSubtreeMetrics: true,
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
          hasProvidedCostDetails,
        }),
      ).toBe(expected);
    },
  );
});
