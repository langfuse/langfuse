// @vitest-environment node

import {
  omitFilterFacets,
  type FilterConfig,
} from "@/src/features/filters/lib/filter-config";

describe("omitFilterFacets", () => {
  it("removes omitted facets and default-expanded entries", () => {
    const config: FilterConfig = {
      tableName: "test",
      columnDefinitions: [],
      defaultExpanded: ["userId", "name"],
      facets: [
        { type: "categorical", column: "userId", label: "User ID" },
        { type: "categorical", column: "name", label: "Name" },
      ],
    };

    const result = omitFilterFacets(config, ["userId"]);

    expect(result.facets.map((facet) => facet.column)).toEqual(["name"]);
    expect(result.defaultExpanded).toEqual(["name"]);
    // Recorded so the state hook can refuse to apply what the sidebar cannot
    // show (LFE-14824).
    expect(result.omittedFilterColumns).toEqual(["userId"]);
  });
});
