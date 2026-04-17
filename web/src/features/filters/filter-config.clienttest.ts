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
  });
});
