import { describe, expect, it } from "vitest";

import {
  isGenerationMissingCost,
  isGenerationMissingUsage,
  resolveObservationCostSource,
} from "./costSource";

describe("isGenerationMissingCost", () => {
  const unpriced = {
    type: "GENERATION",
    level: "DEFAULT" as const,
    totalCost: null,
    costDetails: {},
    providedUsageDetails: {},
    providedCostDetails: {},
  };

  it("flags an unpriced generation when calculated cost is empty", () => {
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0,
      }),
    ).toBe(true);
  });

  it("ignores priced generations", () => {
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0.28,
        costDetails: { input: 0.1, output: 0.18, total: 0.28 },
      }),
    ).toBe(false);
  });

  it("ignores an explicitly supplied $0 cost", () => {
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0,
        providedCostDetails: { total: 0 },
      }),
    ).toBe(false);
  });

  it("ignores explicitly submitted zero usage without cost", () => {
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0,
        providedUsageDetails: { input: 0, output: 0, total: 0 },
      }),
    ).toBe(false);
  });

  it("keeps a zero-valued calculated breakdown out of the missing-cost chip", () => {
    expect(
      isGenerationMissingCost({
        ...unpriced,
        totalCost: 0,
        costDetails: { input: 0, output: 0, total: 0 },
      }),
    ).toBe(false);
  });

  it("ignores non-generation types", () => {
    expect(isGenerationMissingCost({ ...unpriced, type: "SPAN" })).toBe(false);
    expect(isGenerationMissingCost({ ...unpriced, type: "EVENT" })).toBe(false);
  });

  it("only flags error generations when they have submitted usage to price", () => {
    const failedGeneration = { ...unpriced, level: "ERROR" as const };
    expect(isGenerationMissingCost(failedGeneration)).toBe(false);
    expect(
      isGenerationMissingCost({
        ...failedGeneration,
        providedUsageDetails: { input: 100, output: 10 },
      }),
    ).toBe(true);
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

describe("isGenerationMissingUsage", () => {
  it("flags a generation without submitted usage or cost", () => {
    expect(
      isGenerationMissingUsage({
        type: "GENERATION",
        level: "DEFAULT",
        providedUsageDetails: {},
        providedCostDetails: {},
      }),
    ).toBe(true);
  });

  it("keeps generations with any submitted usage out of the nudge", () => {
    expect(
      isGenerationMissingUsage({
        type: "GENERATION",
        level: "DEFAULT",
        providedUsageDetails: { input: 0 },
        providedCostDetails: {},
      }),
    ).toBe(false);
  });

  it("keeps generations with an explicit zero cost out of the nudge", () => {
    expect(
      isGenerationMissingUsage({
        type: "GENERATION",
        level: "DEFAULT",
        providedUsageDetails: {},
        providedCostDetails: { total: 0 },
      }),
    ).toBe(false);
  });

  it("ignores non-generation observations", () => {
    expect(
      isGenerationMissingUsage({
        type: "SPAN",
        level: "DEFAULT",
        providedUsageDetails: {},
        providedCostDetails: {},
      }),
    ).toBe(false);
  });

  it("does not nudge error generations to submit usage", () => {
    expect(
      isGenerationMissingUsage({
        type: "GENERATION",
        level: "ERROR",
        providedUsageDetails: {},
        providedCostDetails: {},
      }),
    ).toBe(false);
  });
});
