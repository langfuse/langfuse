import {
  DEFAULT_STRING_KEY_VALUE_OPERATORS,
  FULL_TEXT_STRING_KEY_VALUE_OPERATORS,
  getStringDefaultOperator,
  getStringKeyValueDefaultOperator,
  getStringKeyValueOperators,
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

describe("string key-value filter policy", () => {
  it("keeps string facets on contains by default while allowing explicit defaults", () => {
    expect(getStringDefaultOperator({})).toBe("contains");
    expect(getStringDefaultOperator({ defaultOperator: "=" })).toBe("=");
  });

  it("keeps short-text operators as the default behavior", () => {
    expect(getStringKeyValueOperators({})).toEqual(
      DEFAULT_STRING_KEY_VALUE_OPERATORS,
    );
    expect(getStringKeyValueDefaultOperator({})).toBe("=");
  });

  it("allows configs to opt into full-text operators without changing the persisted filter shape", () => {
    expect(
      getStringKeyValueOperators({ textFilterPolicy: "fullTextObject" }),
    ).toEqual(FULL_TEXT_STRING_KEY_VALUE_OPERATORS);
    expect(
      getStringKeyValueDefaultOperator({ textFilterPolicy: "fullTextObject" }),
    ).toBe("matches");
  });

  it("allows explicit operator lists and defaults", () => {
    expect(getStringKeyValueOperators({ operators: ["contains"] })).toEqual([
      "contains",
    ]);
    expect(
      getStringKeyValueDefaultOperator({
        operators: ["contains"],
        defaultOperator: "contains",
      }),
    ).toBe("contains");
  });
});
