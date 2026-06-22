import { mapWidgetUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";

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
});
