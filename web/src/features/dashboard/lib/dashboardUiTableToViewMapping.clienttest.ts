import { describe, expect, it } from "vitest";

import {
  mapViewFilterToUiTableFilter,
  mapWidgetUiTableFilterToView,
} from "./dashboardUiTableToViewMapping";

describe("boolean score widget filter mappings", () => {
  const booleanFilter = {
    column: "booleanValue",
    type: "boolean" as const,
    operator: "=" as const,
    value: true,
  };

  it("round-trips Boolean Value between editor and query view space", () => {
    expect(
      mapWidgetUiTableFilterToView("scores-boolean", [
        { ...booleanFilter, column: "Boolean Value" },
      ]),
    ).toEqual([booleanFilter]);

    expect(
      mapViewFilterToUiTableFilter("scores-boolean", [booleanFilter]),
    ).toEqual([{ ...booleanFilter, column: "Boolean Value" }]);
  });
});
