import { describe, expect, it } from "vitest";
import {
  transformToPivotTable,
  sortPivotTableRows,
  isSubtotalRow,
  isDataRow,
} from "./pivot-table-utils";

describe("sortPivotTableRows parent grouping", () => {
  it("groups data rows under their own subtotal when one dimension value contains another", () => {
    const data = [
      { country: "AUS", model: "gpt-4", sum_count: 5 },
      { country: "US", model: "gpt-4", sum_count: 2 },
    ];
    const rows = transformToPivotTable(data as never, {
      dimensions: ["country", "model"],
      metrics: ["sum_count"],
      rowLimit: 20,
    } as never);

    const sorted = sortPivotTableRows(rows, {
      column: "sum_count",
      order: "DESC",
    });

    let currentSubtotal: string | null = null;
    const placement: Record<string, string> = {};
    for (const row of sorted) {
      if (isSubtotalRow(row)) currentSubtotal = row.label;
      else if (isDataRow(row)) placement[row.label] = currentSubtotal ?? "";
    }

    // DESC puts "AUS (Subtotal)" first; label-substring matching used to
    // attach the "US - gpt-4" row to it because "AUS" contains "US".
    expect(placement["US - gpt-4"]).toBe("US (Subtotal)");
    expect(placement["AUS - gpt-4"]).toBe("AUS (Subtotal)");
  });

  it("groups data rows correctly when a dimension value contains the label separator ' - '", () => {
    const data = [
      { name: "web - api", model: "gpt-4", sum_count: 5 },
      { name: "web", model: "gpt-4", sum_count: 2 },
    ];
    const rows = transformToPivotTable(data as never, {
      dimensions: ["name", "model"],
      metrics: ["sum_count"],
      rowLimit: 20,
    } as never);

    const sorted = sortPivotTableRows(rows, {
      column: "sum_count",
      order: "DESC",
    });

    let currentSubtotal: string | null = null;
    const placement: Record<string, string> = {};
    for (const row of sorted) {
      if (isSubtotalRow(row)) currentSubtotal = row.label;
      else if (isDataRow(row)) placement[row.label] = currentSubtotal ?? "";
    }

    expect(placement["web - api - gpt-4"]).toBe("web - api (Subtotal)");
    expect(placement["web - gpt-4"]).toBe("web (Subtotal)");
  });
});
