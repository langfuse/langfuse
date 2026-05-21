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

  it("accepts a `metadata` filter column without checking the view's dimensions", () => {
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
    expect(result.valid).toBe(true);
  });

  it("rejects a filter column that isn't a dimension on the view", () => {
    const result = isValidQuery({
      view: "observations",
      metric: { measure: "count", aggregation: "count" },
      filters: [
        {
          type: "string",
          column: "not_a_dimension",
          operator: "=",
          value: "x",
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Invalid filter column");
      expect(result.reason).toContain("not_a_dimension");
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

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "rejects %s as a filter column (does not walk the prototype chain)",
    (column) => {
      const result = isValidQuery({
        view: "observations",
        metric: { measure: "count", aggregation: "count" },
        filters: [{ type: "string", column, operator: "=", value: "x" }],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("Invalid filter column");
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

  it("rejects a non-stringObject filter on the metadata column", () => {
    // queryBuilder requires metadata filters to be `type: "stringObject"`.
    // Without this, a `{type: "string", column: "metadata"}` filter would
    // parse cleanly here but fail at every scheduler tick downstream.
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
      expect(result.reason).toContain("stringObject");
    }
  });
});
