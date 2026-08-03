import { describe, expect, it } from "vitest";

import {
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
});
