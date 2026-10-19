import { describe, expect, it } from "vitest";

import {
  isGenerationMissingCost,
  resolveObservationCostSource,
} from "./costSource";

describe("isGenerationMissingCost", () => {
  const unpriced = {
    type: "GENERATION",
    totalUsage: 1113,
    totalCost: null,
    costDetails: {},
  };

  it("flags a generation with tokens and no cost", () => {
    expect(isGenerationMissingCost(unpriced)).toBe(true);
    expect(isGenerationMissingCost({ ...unpriced, totalCost: 0 })).toBe(true);
  });

  it("ignores generations without tokens, e.g. image models", () => {
    expect(isGenerationMissingCost({ ...unpriced, totalUsage: 0 })).toBe(false);
  });

  it("ignores priced generations, including a matched zero price", () => {
    expect(isGenerationMissingCost({ ...unpriced, totalCost: 0.28 })).toBe(
      false,
    );
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0,
        costDetails: { input: 0, total: 0 },
      }),
    ).toBe(false);
  });

  it("ignores non-generation types", () => {
    expect(isGenerationMissingCost({ ...unpriced, type: "SPAN" })).toBe(false);
  });
});

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
