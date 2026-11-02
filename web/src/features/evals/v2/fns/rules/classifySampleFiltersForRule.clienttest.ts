import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { classifySampleFiltersForRule } from "./classifySampleFiltersForRule";

describe("classifySampleFiltersForRule", () => {
  it("separates filters that evaluation rules cannot apply", () => {
    const filters = [
      {
        column: "type",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["GENERATION"],
      },
      {
        column: "totalCost",
        type: "number" as const,
        operator: ">" as const,
        value: 0.01,
      },
      {
        column: "scores_avg",
        type: "numberObject" as const,
        operator: ">" as const,
        key: "accuracy",
        value: 0.8,
      },
    ] satisfies FilterState;

    const result = classifySampleFiltersForRule(filters);

    expect(result.supportedFilters).toEqual([filters[0]]);
    expect([...result.unsupportedReasons.keys()]).toEqual([1, 2]);
    expect(result.unsupportedReasons.get(1)).toMatch(/cost/i);
    expect(result.unsupportedReasons.get(2)).toMatch(/scores/i);
  });

  it("supports filters backed directly by the evaluation payload", () => {
    const filters = [
      {
        column: "providedModelName",
        type: "string" as const,
        operator: "=" as const,
        value: "gpt-4o",
      },
      {
        column: "promptName",
        type: "string" as const,
        operator: "=" as const,
        value: "support-agent",
      },
      {
        column: "promptVersion",
        type: "number" as const,
        operator: ">=" as const,
        value: 2,
      },
      {
        column: "release",
        type: "string" as const,
        operator: "=" as const,
        value: "2026-08",
      },
      {
        column: "statusMessage",
        type: "string" as const,
        operator: "contains" as const,
        value: "rate limit",
      },
      {
        column: "experimentName",
        type: "string" as const,
        operator: "=" as const,
        value: "checkout-eval",
      },
    ] satisfies FilterState;

    const result = classifySampleFiltersForRule(filters);

    expect(result.supportedFilters).toEqual(filters);
    expect(result.unsupportedReasons.size).toBe(0);
  });

  it("allows every filter to be excluded from the rule", () => {
    const filters = [
      {
        column: "latency",
        type: "number" as const,
        operator: ">" as const,
        value: 2,
      },
    ] satisfies FilterState;

    const result = classifySampleFiltersForRule(filters);

    expect(result.supportedFilters).toEqual([]);
    expect(result.unsupportedReasons.size).toBe(1);
  });
});
