import {
  omitFilterFacets,
  type FilterConfig,
} from "@/src/features/filters/lib/filter-config";

describe("omitFilterFacets", () => {
  it("removes omitted facets and default-expanded entries", () => {
    const config: FilterConfig = {
      tableName: "test",
      columnDefinitions: [
        {
          name: "User ID",
          id: "userId",
          type: "stringOptions",
          options: [],
          internal: "user_id",
        },
        {
          name: "Name",
          id: "name",
          type: "stringOptions",
          options: [],
          internal: "name",
        },
        {
          name: "Timestamp",
          id: "timestamp",
          type: "datetime",
          internal: "timestamp",
        },
      ],
      defaultExpanded: ["userId", "name"],
      facets: [
        { type: "categorical", column: "userId", label: "User ID" },
        { type: "categorical", column: "name", label: "Name" },
      ],
    };

    const result = omitFilterFacets(config, ["userId"]);

    expect(result.facets.map((facet) => facet.column)).toEqual(["name"]);
    expect(result.columnDefinitions.map((column) => column.id)).toEqual([
      "name",
      "timestamp",
    ]);
    expect(result.defaultExpanded).toEqual(["name"]);
  });
});
