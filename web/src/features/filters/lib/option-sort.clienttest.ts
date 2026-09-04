// @vitest-environment node

import { describe, expect, it } from "vitest";

import { sortOptionValues } from "@/src/features/filters/lib/option-sort";

describe("sortOptionValues", () => {
  it("orders values alphabetically, case-insensitively and locale-aware", () => {
    // Bytewise (ClickHouse `ORDER BY value ASC`) would yield
    // ["Zebra", "apple", "banana", "Ärger"] — uppercase first, accents last.
    expect(sortOptionValues(["Zebra", "banana", "Ärger", "apple"])).toEqual([
      "apple",
      "Ärger",
      "banana",
      "Zebra",
    ]);
  });

  it("sorts option objects by value and passes undefined through", () => {
    expect(
      sortOptionValues([
        { value: "prod", count: 2 },
        { value: "dev", count: 9 },
      ]),
    ).toEqual([
      { value: "dev", count: 9 },
      { value: "prod", count: 2 },
    ]);
    // undefined means "not loaded yet" for the facet consumers — keep it.
    expect(sortOptionValues(undefined)).toBeUndefined();
  });
});
