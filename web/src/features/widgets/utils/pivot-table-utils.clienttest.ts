import { describe, expect, it } from "vitest";

import { transformToPivotTable, type DatabaseRow } from "./pivot-table-utils";

// One row per (tag, name) pair, the shape an exploded tags breakdown returns:
// trace-1 carries both tags, so it appears under each — summing across tags
// double-counts it.
const explodedRows: DatabaseRow[] = [
  { tags: "chat", name: "trace-1", count_count: 1 },
  { tags: "agent", name: "trace-1", count_count: 1 },
  { tags: "chat", name: "trace-2", count_count: 1 },
];

describe("transformToPivotTable with exploded dimensions", () => {
  it("keeps the grand total when no dimension is exploded", () => {
    const rows = transformToPivotTable(explodedRows, {
      dimensions: ["name"],
      metrics: ["count_count"],
    });
    const total = rows.find((row) => row.type === "total");
    expect(total).toBeDefined();
    expect(total?.suppressedValues).toBeUndefined();
  });

  it("drops the grand total when a dimension is exploded", () => {
    // A single-dimension pivot receives pre-aggregated rows: one per tag.
    const rows = transformToPivotTable(
      [
        { tags: "chat", count_count: 2 },
        { tags: "agent", count_count: 1 },
      ],
      {
        dimensions: ["tags"],
        metrics: ["count_count"],
        explodedDimensions: ["tags"],
      },
    );
    expect(rows.find((row) => row.type === "total")).toBeUndefined();
    // Bucket rows stay honest: one row per tag with its distinct count.
    expect(rows.filter((row) => row.type === "data")).toHaveLength(2);
  });

  it("keeps subtotals that only aggregate within one exploded bucket", () => {
    // dims [tags, name]: the per-tag subtotal sums across names inside one
    // tag bucket — entities there are distinct, so the value is honest.
    const rows = transformToPivotTable(explodedRows, {
      dimensions: ["tags", "name"],
      metrics: ["count_count"],
      explodedDimensions: ["tags"],
    });
    const subtotals = rows.filter((row) => row.type === "subtotal");
    expect(subtotals.length).toBeGreaterThan(0);
    for (const subtotal of subtotals) {
      expect(subtotal.suppressedValues).toBeUndefined();
      expect(typeof subtotal.values.count_count).toBe("number");
    }
    expect(rows.find((row) => row.type === "total")).toBeUndefined();
  });

  it("suppresses subtotal values that aggregate across an exploded dimension", () => {
    // dims [name, tags]: the per-name subtotal sums across tags — trace-1
    // carries two tags and would be counted twice. The row survives as a
    // group header with suppressed values.
    const rows = transformToPivotTable(explodedRows, {
      dimensions: ["name", "tags"],
      metrics: ["count_count"],
      explodedDimensions: ["tags"],
    });
    const subtotals = rows.filter((row) => row.type === "subtotal");
    expect(subtotals.length).toBeGreaterThan(0);
    for (const subtotal of subtotals) {
      expect(subtotal.suppressedValues).toBe(true);
      expect(subtotal.values).toEqual({});
    }
    expect(rows.find((row) => row.type === "total")).toBeUndefined();
  });
});
