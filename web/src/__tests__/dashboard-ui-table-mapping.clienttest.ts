import {
  mapLegacyUiTableFilterToView,
  mapViewFilterToUiTableFilter,
  mapWidgetUiTableFilterToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";

describe("dashboard UI table filter mapping", () => {
  it.each(["scores-numeric", "scores-categorical"] as const)(
    "maps Score Comment filters on %s to the score comment field",
    (view) => {
      expect(
        mapWidgetUiTableFilterToView(view, [
          {
            column: "Score Comment",
            operator: "is not null",
            value: "",
            type: "string",
          },
        ]),
      ).toEqual([
        {
          column: "comment",
          operator: "is not null",
          value: "",
          type: "string",
        },
      ]);
    },
  );

  it.each(["scores-numeric", "scores-categorical"] as const)(
    "maps stored score comment filters on %s back to the editor label",
    (view) => {
      expect(
        mapViewFilterToUiTableFilter(view, [
          {
            column: "comment",
            operator: "is not null",
            value: "",
            type: "string",
          },
        ]),
      ).toEqual([
        {
          column: "Score Comment",
          operator: "is not null",
          value: "",
          type: "string",
        },
      ]);
    },
  );

  it.each(["scores-numeric", "scores-categorical"] as const)(
    "maps legacy scoreComment filters on %s to the score comment field",
    (view) => {
      expect(
        mapLegacyUiTableFilterToView(view, [
          {
            column: "scoreComment",
            operator: "is not null",
            value: "",
            type: "string",
          },
        ]),
      ).toEqual([
        {
          column: "comment",
          operator: "is not null",
          value: "",
          type: "string",
        },
      ]);
    },
  );
});
