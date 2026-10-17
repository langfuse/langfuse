// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  displayNameForFilterColumn,
  mapLegacyUiTableFilterToView,
  mapViewFilterToUiTableFilter,
  mapWidgetUiTableFilterToView,
} from "./dashboardUiTableToViewMapping";

describe("widget filter mappings", () => {
  it.each([
    ["scores-boolean", "booleanValue", "Boolean Value"],
    ["observations", "isRootObservation", "Is Root Observation"],
  ] as const)(
    "round-trips the %s boolean filter between editor and query view space",
    (view, canonicalColumn, editorColumn) => {
      const canonicalFilter = {
        column: canonicalColumn,
        type: "boolean" as const,
        operator: "=" as const,
        value: true,
      };
      const editorFilter = { ...canonicalFilter, column: editorColumn };

      expect(mapWidgetUiTableFilterToView(view, [editorFilter])).toEqual([
        canonicalFilter,
      ]);
      expect(mapViewFilterToUiTableFilter(view, [canonicalFilter])).toEqual([
        editorFilter,
      ]);
    },
  );

  it.each([["traces"], ["observations"]] as const)(
    "round-trips the %s ingestionApiKey filter between editor and query view space",
    (view) => {
      const canonicalFilter = {
        column: "ingestionApiKey",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["pk-lf-test"],
      };
      const editorFilter = { ...canonicalFilter, column: "Ingestion API Key" };

      expect(mapWidgetUiTableFilterToView(view, [editorFilter])).toEqual([
        canonicalFilter,
      ]);
      expect(mapViewFilterToUiTableFilter(view, [canonicalFilter])).toEqual([
        editorFilter,
      ]);
    },
  );
});

describe("displayNameForFilterColumn", () => {
  it.each([
    ["providedModelName", "Model"],
    ["model", "Model"],
    ["Model", "Model"],
    ["isRootObservation", "Is Root Observation"],
    ["userId", "User"],
    ["calledToolNames", "Tool Names (Called)"],
    ["level", "Status"],
    ["Level", "Status"],
    ["Status", "Status"],
    ["ingestionApiKey", "Ingestion API Key"],
  ])("resolves %s to %s", (column, expected) => {
    expect(displayNameForFilterColumn(column)).toBe(expected);
  });

  it("unmapped column: falls back to the raw column", () => {
    expect(displayNameForFilterColumn("totallyUnknownColumn")).toBe(
      "totallyUnknownColumn",
    );
  });

  it("maps stored Level dashboard filters onto the level view field", () => {
    expect(
      mapLegacyUiTableFilterToView("observations", [
        {
          column: "Level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
      ]),
    ).toEqual([
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
  });
});
