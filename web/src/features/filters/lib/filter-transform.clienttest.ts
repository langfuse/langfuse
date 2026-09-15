// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getColumnOptionsForFilterRow } from "./filter-transform";

describe("getColumnOptionsForFilterRow", () => {
  const columns = [
    { name: "⭐️", id: "bookmarked", type: "boolean", internal: "t.bookmarked" },
    { name: "Name", id: "traceName", type: "string", internal: 't."name"' },
  ] as const;
  const hiddenUnlessSelected = ["bookmarked", "⭐️"];

  it("returns all columns when nothing is hidden", () => {
    expect(getColumnOptionsForFilterRow([...columns], undefined)).toEqual(
      columns,
    );
  });

  it("hides retired columns on a new filter row", () => {
    expect(
      getColumnOptionsForFilterRow(
        [...columns],
        undefined,
        hiddenUnlessSelected,
      ),
    ).toEqual([columns[1]]);
  });

  it.each(["bookmarked", "⭐️"] as const)(
    "keeps the retired column only on the row that already uses %s",
    (filterColumn) => {
      expect(
        getColumnOptionsForFilterRow(
          [...columns],
          filterColumn,
          hiddenUnlessSelected,
        ),
      ).toEqual(columns);
    },
  );

  it("does not re-offer a retired column on a sibling row", () => {
    expect(
      getColumnOptionsForFilterRow(
        [...columns],
        "traceName",
        hiddenUnlessSelected,
      ),
    ).toEqual([columns[1]]);
  });
});
