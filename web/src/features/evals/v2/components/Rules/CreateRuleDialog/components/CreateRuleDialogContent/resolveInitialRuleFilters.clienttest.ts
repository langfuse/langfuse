import { describe, expect, it } from "vitest";

import { resolveInitialRuleFilters } from "./resolveInitialRuleFilters";

describe("resolveInitialRuleFilters", () => {
  it("starts new rules with a root span filter", () => {
    expect(resolveInitialRuleFilters()).toEqual([
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ]);
  });

  it("preserves supplied filters", () => {
    const filters = [
      {
        column: "type",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["GENERATION"],
      },
    ];

    expect(resolveInitialRuleFilters(filters)).toBe(filters);
  });
});
