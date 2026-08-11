import { getFacetSummary, rankFacetOptions } from "./facet-display";
import type {
  CategoricalUIFilter,
  NumericUIFilter,
  StringUIFilter,
  StringKeyValueUIFilter,
} from "@/src/features/filters/hooks/useSidebarFilterState";

const baseFacet = {
  column: "col",
  label: "Col",
  loading: false,
  expanded: false,
  isDisabled: false,
  onReset: () => {},
};

function categorical(
  overrides: Partial<CategoricalUIFilter>,
): CategoricalUIFilter {
  return {
    ...baseFacet,
    type: "categorical",
    isActive: false,
    value: [],
    options: [],
    counts: new Map(),
    onChange: () => {},
    ...overrides,
  };
}

describe("getFacetSummary", () => {
  it("reads 'All' for an inactive checkbox facet with options (all-checked = no filter)", () => {
    expect(
      getFacetSummary(categorical({ options: ["a", "b"], value: ["a", "b"] })),
    ).toBe("All");
  });

  it("stays quiet for an inactive facet without options", () => {
    expect(getFacetSummary(categorical({}))).toBeNull();
  });

  it("describes the kept subset of an inactive facet under an implicit default (managed environments)", () => {
    expect(
      getFacetSummary(
        categorical({
          options: ["default", "sdk-experiment", "langfuse-evaluation"],
          value: ["default"],
        }),
      ),
    ).toBe("default");
    expect(
      getFacetSummary(
        categorical({
          options: ["default", "dev", "sdk-experiment"],
          value: ["default", "dev"],
        }),
      ),
    ).toBe("2 selected");
  });

  it("names a single selected value, honoring display labels", () => {
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          options: ["prod-id", "dev-id"],
          value: ["prod-id"],
          displayByValue: new Map([["prod-id", "production"]]),
        }),
      ),
    ).toBe("production");
  });

  it("counts a multi-value selection", () => {
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          options: ["a", "b", "c"],
          value: ["a", "b"],
        }),
      ),
    ).toBe("2 selected");
  });

  it("describes none-of filters by their exclusions, not the kept complement", () => {
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          operator: "none of",
          options: ["a", "b", "c"],
          value: ["a", "b"],
        }),
      ),
    ).toBe("not c");
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          operator: "none of",
          options: ["a", "b", "c"],
          value: ["a"],
        }),
      ),
    ).toBe("not 2 values");
  });

  it("stays quiet on single-option facets instead of a meaningless 'All'", () => {
    expect(
      getFacetSummary(
        categorical({ options: ["default"], value: ["default"] }),
      ),
    ).toBeNull();
  });

  it("reports both checkbox and text parts when a column carries both", () => {
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          operator: "any of",
          options: ["a", "b", "c"],
          value: ["a"],
          textFilters: [{ operator: "does not contain", value: "x" }],
        }),
      ),
    ).toBe('a · not "x"');
  });

  it("counts carried exclusions outside the option list via excludedValues (LFE-10717)", () => {
    // Deep-linked `none of [c, legacy]` where only `c` is still observed:
    // the visible complement alone would undercount to "not c".
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          operator: "none of",
          options: ["a", "b", "c"],
          value: ["a", "b"],
          excludedValues: ["c", "legacy"],
        }),
      ),
    ).toBe("not 2 values");
    // Every exclusion out-of-list: previously the generic "filtered".
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          operator: "none of",
          options: ["a", "b"],
          value: ["a", "b"],
          excludedValues: ["legacy"],
        }),
      ),
    ).toBe("not legacy");
  });

  it("reads an explicit keep-everything filter as an active 'All' (managed env override)", () => {
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          operator: "any of",
          options: ["default", "dev"],
          value: ["default", "dev"],
        }),
      ),
    ).toBe("All");
  });

  it("says 'filtered' for a live none-of whose exclusions fell out of the option list", () => {
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          operator: "none of",
          options: ["a", "b"],
          value: ["a", "b"],
        }),
      ),
    ).toBe("filtered");
  });

  it("describes text filters", () => {
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          textFilters: [{ operator: "contains", value: "chat" }],
        }),
      ),
    ).toBe('contains "chat"');
    expect(
      getFacetSummary(
        categorical({
          isActive: true,
          textFilters: [
            { operator: "does not contain", value: "chat" },
            { operator: "contains", value: "bot" },
          ],
        }),
      ),
    ).toBe("2 text filters");
  });

  it("formats numeric ranges with their unit", () => {
    const numeric: NumericUIFilter = {
      ...baseFacet,
      type: "numeric",
      isActive: true,
      value: [0.5, 30],
      min: 0,
      max: 60,
      unit: "s",
      onChange: () => {},
    };
    expect(getFacetSummary(numeric)).toBe("0.5–30 s");
    expect(getFacetSummary({ ...numeric, isActive: false })).toBeNull();
  });

  it("quotes string filters", () => {
    const str: StringUIFilter = {
      ...baseFacet,
      type: "string",
      isActive: true,
      value: "checkout",
      onChange: () => {},
    };
    expect(getFacetSummary(str)).toBe('"checkout"');
  });

  it("names the key of a single keyed condition and counts several", () => {
    const keyed: StringKeyValueUIFilter = {
      ...baseFacet,
      type: "stringKeyValue",
      isActive: true,
      value: [{ key: "env", operator: "=", value: "prod" }],
      onChange: () => {},
    };
    expect(getFacetSummary(keyed)).toBe("env");
    expect(
      getFacetSummary({
        ...keyed,
        value: [
          { key: "env", operator: "=", value: "prod" },
          { key: "region", operator: "contains", value: "eu" },
        ],
      }),
    ).toBe("2 conditions");
  });
});

describe("rankFacetOptions", () => {
  it("ranks prefix matches before substring matches (search-bar parity)", () => {
    expect(rankFacetOptions(["my-chat", "chat-bot", "other"], "chat")).toEqual([
      "chat-bot",
      "my-chat",
    ]);
  });

  it("matches display labels and keeps the better rank", () => {
    expect(
      rankFacetOptions(
        ["id-1", "id-2"],
        "prod",
        new Map([["id-2", "production"]]),
      ),
    ).toEqual(["id-2"]);
  });

  it("returns everything unchanged for an empty query", () => {
    expect(rankFacetOptions(["b", "a"], "")).toEqual(["b", "a"]);
  });
});
