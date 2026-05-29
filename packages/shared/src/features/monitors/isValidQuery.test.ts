import { describe, it, expect } from "vitest";

import { isValidQuery } from "./isValidQuery";

describe("isValidQuery", () => {
  it("accepts a valid (view, measure, aggregation) tuple", () => {
    const result = isValidQuery({
      view: "observations",
      metric: { measure: "count", aggregation: "count" },
      filters: [],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown measure for the view", () => {
    const result = isValidQuery({
      view: "observations",
      metric: { measure: "bogus_measure", aggregation: "count" },
      filters: [],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Invalid measure");
      expect(result.reason).toContain("bogus_measure");
    }
  });

  it("rejects a `metadata` filter column: too expensive at evaluation cadence", () => {
    const result = isValidQuery({
      view: "observations",
      metric: { measure: "count", aggregation: "count" },
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
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("metadata");
      expect(result.reason).toContain("not supported for monitors");
    }
  });

  it("rejects when the view itself is unknown", () => {
    // `getViewDeclaration` throws InvalidRequestError on an unknown view name.
    expect(() =>
      isValidQuery({
        view: "bogus" as never,
        metric: { measure: "count", aggregation: "count" },
        filters: [],
      }),
    ).toThrow(/View 'bogus' is not supported/);
  });

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "rejects %s as a measure (does not walk the prototype chain)",
    (measure) => {
      const result = isValidQuery({
        view: "observations",
        metric: { measure, aggregation: "count" },
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
      metric: { measure: "count", aggregation: "histogram" },
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
      metric: { measure: "count", aggregation: "count" },
      filters: [filter],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("unique");
      expect(result.reason).toContain(filter.type);
    }
  });

  it("rejects a non-stringObject filter on the metadata column too", () => {
    // Metadata is disallowed regardless of filter type — the column itself
    // is not a valid monitor filter.
    const result = isValidQuery({
      view: "observations",
      metric: { measure: "count", aggregation: "count" },
      filters: [
        {
          type: "string",
          column: "metadata",
          operator: "=",
          value: "acme",
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("metadata");
      expect(result.reason).toContain("not supported for monitors");
    }
  });
});
