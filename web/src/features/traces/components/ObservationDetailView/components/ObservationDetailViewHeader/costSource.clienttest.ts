import { describe, expect, it } from "vitest";

import {
  isGenerationMissingCost,
  resolveObservationCostSource,
} from "./costSource";

describe("isGenerationMissingCost", () => {
  const unpriced = {
    type: "GENERATION",
    totalCost: null,
    costDetails: {},
    internalModelId: null,
  };

  it("flags a generation with no usage and no cost", () => {
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0,
        costDetails: { input: 0, output: 0, total: 0 },
      }),
    ).toBe(true);
  });

  it("flags a generation with tokens and no cost", () => {
    expect(isGenerationMissingCost(unpriced)).toBe(true);
  });

  it("ignores priced generations", () => {
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0.28,
        costDetails: { input: 0.1, output: 0.18, total: 0.28 },
        internalModelId: "model-1",
      }),
    ).toBe(false);
  });

  it("flags a $0 cost when no model matched", () => {
    expect(isGenerationMissingCost({ ...unpriced, totalCost: 0 })).toBe(true);
  });

  it("ignores a $0 cost from a matched model", () => {
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0,
        internalModelId: "model-1",
      }),
    ).toBe(false);
  });

  it("ignores non-generation types", () => {
    expect(isGenerationMissingCost({ ...unpriced, type: "SPAN" })).toBe(false);
    expect(isGenerationMissingCost({ ...unpriced, type: "EVENT" })).toBe(false);
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
