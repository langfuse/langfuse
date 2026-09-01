import { describe, expect, it } from "vitest";

import { resolveInitialRuleFilters } from "./resolveInitialRuleFilters";

describe("resolveInitialRuleFilters", () => {
  it("starts new rules without visible filters", () => {
    expect(resolveInitialRuleFilters()).toEqual([]);
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
