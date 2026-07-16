import { describe, expect, it } from "vitest";

import { type FilterState } from "@langfuse/shared";

import { __test } from "./MetricsFilterView";

const {
  viewFiltersToEditorFilters,
  editorFiltersToViewFilters,
  unsupportedViewFilters,
} = __test;

const modelFilter = (column: string): FilterState[number] => ({
  column,
  type: "stringOptions",
  operator: "any of",
  value: ["gpt-4"],
});

describe("editorFiltersToViewFilters", () => {
  it("canonical view row: round-trips through the editor unchanged", () => {
    const filters: FilterState = [modelFilter("providedModelName")];
    expect(
      editorFiltersToViewFilters(
        "observations",
        viewFiltersToEditorFilters("observations", filters),
      ),
    ).toEqual(filters);
  });

  it("legacy UI-table column: canonicalizes to the view dimension name", () => {
    expect(
      editorFiltersToViewFilters("observations", [modelFilter("Model")]),
    ).toEqual([modelFilter("providedModelName")]);
  });

  it("unmapped column: preserved verbatim, never dropped", () => {
    const filters: FilterState = [modelFilter("totallyUnknownColumn")];
    expect(editorFiltersToViewFilters("observations", filters)).toEqual(
      filters,
    );
    expect(
      editorFiltersToViewFilters(
        "observations",
        viewFiltersToEditorFilters("observations", filters),
      ),
    ).toEqual(filters);
  });
});

describe("unsupportedViewFilters", () => {
  it("invalid-for-view column: surfaced as unsupported, not silently dropped", () => {
    const unsupported = unsupportedViewFilters("traces", [
      modelFilter("model"),
    ]);
    expect(unsupported.map((f) => f.column)).toContain("model");
  });

  it("valid-for-view column: not flagged as unsupported", () => {
    expect(
      unsupportedViewFilters("observations", [
        modelFilter("providedModelName"),
      ]),
    ).toEqual([]);
  });
});
