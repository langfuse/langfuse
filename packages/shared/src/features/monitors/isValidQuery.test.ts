import { describe, it, expect } from "vitest";

import { isValidQuery } from "./isValidQuery";

describe("isValidQuery", () => {
  it("accepts a valid (view, measure, aggregation) tuple", () => {
    const result = isValidQuery({
      view: "observations",
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown measure for the view", () => {
    const result = isValidQuery({
      view: "observations",
      metrics: [{ measure: "bogus_measure", aggregation: "count" }],
      filters: [],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Invalid measure");
      expect(result.reason).toContain("bogus_measure");
    }
  });

  it("accepts a `metadata` stringObject filter column", () => {
    const result = isValidQuery({
      view: "observations",
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [
        {
          type: "stringObject",
          column: "metadata",
          key: "tenant",
          operator: "=",
          value: "acme",
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects when the view itself is unknown", () => {
    // `getViewDeclaration` throws InvalidRequestError on an unknown view name.
    expect(() =>
      isValidQuery({
        view: "bogus" as never,
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
      }),
    ).toThrow(/View 'bogus' is not supported/);
  });

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "rejects %s as a measure (does not walk the prototype chain)",
    (measure) => {
      const result = isValidQuery({
        view: "observations",
        metrics: [{ measure, aggregation: "count" }],
        filters: [],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("Invalid measure");
      }
    },
  );

  it("rejects histogram aggregation (bucket array is not comparable to a scalar threshold)", () => {
    const result = isValidQuery({
      view: "observations",
      metrics: [{ measure: "count", aggregation: "histogram" }],
      filters: [],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("histogram");
      expect(result.reason).toContain("not supported for monitors");
    }
  });

  it.each([
    {
      type: "stringOptions" as const,
      column: "environment",
      operator: "any of" as const,
      value: ["prod", "prod", "staging"],
    },
    {
      type: "arrayOptions" as const,
      column: "tags",
      operator: "all of" as const,
      value: ["a", "a"],
    },
  ])("rejects a $type filter with duplicate value entries", (filter) => {
    const result = isValidQuery({
      view: "observations",
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [filter],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("unique");
      expect(result.reason).toContain(filter.type);
    }
  });

  it("partitions a mixed batch: keeps valid metrics, rejects only the invalid ones", () => {
    const valid = { measure: "count", aggregation: "count" as const };
    const invalid = { measure: "bogus_measure", aggregation: "count" as const };
    const result = isValidQuery({
      view: "observations",
      metrics: [valid, invalid],
      filters: [],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.accepted).toEqual([valid]);
      expect(result.rejected).toEqual([invalid]);
      expect(result.reason).toContain("bogus_measure");
    }
  });

  it("accepts an all-valid batch: every metric accepted, none rejected", () => {
    const metrics = [{ measure: "count", aggregation: "count" as const }];
    const result = isValidQuery({
      view: "observations",
      metrics,
      filters: [],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.accepted).toEqual(metrics);
      expect(result.rejected).toEqual([]);
    }
  });

  it("rejects a bad filter as a whole-query failure: every metric rejected, none accepted", () => {
    const metrics = [{ measure: "count", aggregation: "count" as const }];
    const result = isValidQuery({
      view: "observations",
      metrics,
      filters: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["prod", "prod"],
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.accepted).toEqual([]);
      expect(result.rejected).toEqual(metrics);
      expect(result.reason).toContain("unique");
    }
  });
});
