import { describe, expect, it } from "vitest";

import { eventsTableTraceNameSql } from "../../../eventsTable";
import {
  BooleanObjectFilter,
  FilterList,
  filtersRequireEventsFull,
  metadataFilterIsEventsCoreSafe,
  NullFilter,
  NumberObjectFilter,
  StringFilter,
  StringObjectFilter,
  StringOptionsFilter,
} from "./clickhouse-filter";
import { createFilterFromFilterState } from "./factory";
import { experimentItemsTableNativeUiColumnDefinitions } from "../../tableMappings/mapExperimentItemsTable";

// events_core_mv truncates metadata values to leftUTF8(v, 200), so the safety
// boundary is 200 Unicode code points.
const under200 = "a".repeat(199);
const exactly200 = "a".repeat(200);
const over200 = "a".repeat(500);

const metadataString = (
  operator: StringObjectFilter["operator"],
  value: string,
) =>
  new StringObjectFilter({
    clickhouseTable: "events_core",
    field: "metadata",
    key: "some_key",
    operator,
    value,
  });

describe("metadataFilterIsEventsCoreSafe", () => {
  it("keeps `=` on a sub-200 value on events_core", () => {
    expect(metadataFilterIsEventsCoreSafe("=", under200)).toBe(true);
  });

  it("routes `=` at exactly 200 to events_full (a >200 stored value shares the first 200 chars)", () => {
    expect(metadataFilterIsEventsCoreSafe("=", exactly200)).toBe(false);
  });

  it("routes `=` above 200 to events_full", () => {
    expect(metadataFilterIsEventsCoreSafe("=", over200)).toBe(false);
  });

  it("keeps `starts with` up to and including 200 on events_core", () => {
    expect(metadataFilterIsEventsCoreSafe("starts with", exactly200)).toBe(
      true,
    );
  });

  it("routes `starts with` above 200 to events_full", () => {
    expect(metadataFilterIsEventsCoreSafe("starts with", over200)).toBe(false);
  });

  it.each(["contains", "does not contain", "ends with", "matches"] as const)(
    "routes truncation-sensitive `%s` to events_full regardless of value",
    (operator) => {
      expect(metadataFilterIsEventsCoreSafe(operator, "x")).toBe(false);
    },
  );

  // Fail-safe default: the classifier is an allow-list, so any operator not
  // explicitly whitelisted must route to events_full. `!=` and `any of` are
  // ClickhouseOperator members that are not on the allow-list.
  it.each(["!=", "any of"] as const)(
    "routes non-allow-listed `%s` to events_full by default",
    (operator) => {
      expect(metadataFilterIsEventsCoreSafe(operator, "x")).toBe(false);
    },
  );

  it("keeps numeric metadata comparisons on events_core", () => {
    expect(metadataFilterIsEventsCoreSafe("=", 42)).toBe(true);
    expect(metadataFilterIsEventsCoreSafe(">", 42)).toBe(true);
  });

  it("keeps boolean metadata comparisons on events_core", () => {
    expect(metadataFilterIsEventsCoreSafe("=", true)).toBe(true);
    expect(metadataFilterIsEventsCoreSafe("<>", false)).toBe(true);
  });

  it("keeps null / existence checks on events_core", () => {
    expect(metadataFilterIsEventsCoreSafe("is null", undefined)).toBe(true);
    expect(metadataFilterIsEventsCoreSafe("is not null", undefined)).toBe(true);
  });

  it("keeps key presence/absence checks on events_core (metadata_names is untruncated)", () => {
    expect(metadataFilterIsEventsCoreSafe("is set", "")).toBe(true);
    expect(metadataFilterIsEventsCoreSafe("is not set", "")).toBe(true);
  });

  it("counts by code point, not UTF-16 unit (astral chars near the boundary)", () => {
    // 100 astral code points = 200 UTF-16 units but only 100 code points, so an
    // `=` filter stays on events_core.
    const astral = "\u{1F600}".repeat(100);
    expect(astral.length).toBe(200); // UTF-16 units
    expect(metadataFilterIsEventsCoreSafe("=", astral)).toBe(true);
  });
});

describe("filtersRequireEventsFull metadata routing", () => {
  const requires = (filter: StringObjectFilter | NumberObjectFilter) =>
    filtersRequireEventsFull(new FilterList([filter]));

  it("keeps a metadata `=` with a sub-200 param on events_core", () => {
    // Regression: a >200-char stored value truncates to 200 code points and can
    // never equal this <200 param, so events_core stays correct.
    expect(requires(metadataString("=", under200))).toBe(false);
  });

  it("keeps metadata `starts with` (<=200), numeric, and boolean filters on events_core", () => {
    expect(requires(metadataString("starts with", exactly200))).toBe(false);
    expect(
      requires(
        new NumberObjectFilter({
          clickhouseTable: "events_core",
          field: "metadata",
          key: "n",
          operator: "=",
          value: 5,
        }),
      ),
    ).toBe(false);
    expect(
      filtersRequireEventsFull(
        new FilterList([
          new BooleanObjectFilter({
            clickhouseTable: "events_core",
            field: "metadata",
            key: "b",
            operator: "=",
            value: true,
          }),
        ]),
      ),
    ).toBe(false);
    expect(
      filtersRequireEventsFull(
        new FilterList([
          new NullFilter({
            clickhouseTable: "events_core",
            field: "metadata",
            operator: "is not null",
          }),
        ]),
      ),
    ).toBe(false);
  });

  it("routes a metadata `contains` to events_full (match may sit past char 200)", () => {
    expect(requires(metadataString("contains", "needle"))).toBe(true);
  });

  it("routes metadata `ends with`, `does not contain`, and `=` >=200 to events_full", () => {
    expect(requires(metadataString("ends with", "x"))).toBe(true);
    expect(requires(metadataString("does not contain", "x"))).toBe(true);
    expect(requires(metadataString("=", exactly200))).toBe(true);
    expect(requires(metadataString("starts with", over200))).toBe(true);
  });
});

describe("StringObjectFilter key presence/absence operators", () => {
  it("compiles `is set` / `is not set` to has() on events tables", () => {
    expect(metadataString("is set", "").apply().query).toMatch(
      /^has\(metadata_names, \{stringObjectKeyFilter\w+: String\}\)$/,
    );
    expect(metadataString("is not set", "").apply().query).toMatch(
      /^NOT \(has\(metadata_names, \{stringObjectKeyFilter\w+: String\}\)\)$/,
    );
  });

  it("compiles `is set` / `is not set` to mapContains() on map tables", () => {
    const mapFilter = (operator: StringObjectFilter["operator"]) =>
      new StringObjectFilter({
        clickhouseTable: "traces",
        field: "metadata",
        key: "some_key",
        operator,
        value: "",
      });
    expect(mapFilter("is set").apply().query).toMatch(
      /^mapContains\(metadata, \{stringObjectKeyFilter\w+: String\}\)$/,
    );
    expect(mapFilter("is not set").apply().query).toMatch(
      /^NOT \(mapContains\(metadata, \{stringObjectKeyFilter\w+: String\}\)\)$/,
    );
  });

  it("keeps presence/absence filters on events_core", () => {
    expect(
      filtersRequireEventsFull(new FilterList([metadataString("is set", "")])),
    ).toBe(false);
    expect(
      filtersRequireEventsFull(
        new FilterList([metadataString("is not set", "")]),
      ),
    ).toBe(false);
  });
});

describe("NullFilter metadata filters on events tables", () => {
  it.each([
    ["metadata", "metadata_names"],
    ["experiment_metadata", "experiment_metadata_names"],
    ["experiment_item_metadata", "experiment_item_metadata_names"],
  ] as const)(
    "compiles `%s` null checks against `%s`",
    (field, namesColumn) => {
      const isNullFilter = new NullFilter({
        clickhouseTable: "events_proto",
        field,
        operator: "is null",
        tablePrefix: "e",
      });
      const isNotNullFilter = new NullFilter({
        clickhouseTable: "events_proto",
        field,
        operator: "is not null",
        tablePrefix: "e",
      });

      expect(isNullFilter.apply()).toEqual({
        query: `empty(e.${namesColumn})`,
        params: {},
      });
      expect(isNotNullFilter.apply()).toEqual({
        query: `notEmpty(e.${namesColumn})`,
        params: {},
      });
    },
  );

  it("keeps null filters on legacy map tables unchanged", () => {
    const filter = new NullFilter({
      clickhouseTable: "traces",
      field: "metadata",
      operator: "is null",
    });

    expect(filter.apply()).toEqual({
      query: "metadata is null",
      params: {},
    });
  });
});

describe("NullFilter metadata aliases through table mappings", () => {
  it("compiles experiment item metadata null filters against its names array", () => {
    const [filter] = createFilterFromFilterState(
      [
        {
          column: "itemMetadata",
          operator: "is null",
          value: "",
          type: "null",
        },
      ],
      experimentItemsTableNativeUiColumnDefinitions,
    );

    expect(filter).toBeDefined();
    if (!filter) throw new Error("expected filter");

    expect(filter.apply()).toEqual({
      query: "empty(e.experiment_item_metadata_names)",
      params: {},
    });
  });
});

describe("StringObjectFilter empty-value rejection", () => {
  it.each(["contains", "starts with", "ends with"] as const)(
    "rejects an empty value for the substring operator `%s`",
    (operator) => {
      expect(() => metadataString(operator, "").apply()).toThrow(
        /Empty value is not allowed/,
      );
    },
  );

  it("allows a non-empty value for substring operators", () => {
    expect(() => metadataString("contains", "x").apply()).not.toThrow();
  });

  it("allows an empty value for `=` (empty-string equality is a valid match)", () => {
    expect(() => metadataString("=", "").apply()).not.toThrow();
  });
});

describe("trace_name ngram-index prefilter", () => {
  const traceNameString = (operator: StringFilter["operator"], value: string) =>
    new StringFilter({
      clickhouseTable: "traces", // scores CTE labels it "traces" but runs on events_full
      field: eventsTableTraceNameSql,
      operator,
      value,
    });

  const traceNameOptions = (
    operator: StringOptionsFilter["operator"],
    values: string[],
    emptyEqualsNull = false,
  ) =>
    new StringOptionsFilter({
      clickhouseTable: "traces",
      field: eventsTableTraceNameSql,
      operator,
      values,
      emptyEqualsNull,
    });

  it("prepends an OR prefilter over both indexed columns for `=`", () => {
    const { query } = traceNameString("=", "foo").apply();
    expect(query).toMatch(
      /^\(lower\(e\.trace_name\) = lower\(\{stringFilter\w+: String\}\) OR lower\(e\.name\) = lower\(\{stringFilter\w+: String\}\)\) AND \(/,
    );
    expect(query).toContain(`AND (${eventsTableTraceNameSql} = {`);
  });

  it.each([
    ["contains", "%foo%"],
    ["starts with", "foo%"],
    ["ends with", "%foo"],
  ] as const)(
    "prepends a LIKE prefilter over both indexed columns for `%s`",
    (operator, pattern) => {
      const { query, params } = traceNameString(operator, "foo").apply();
      expect(query).toContain("lower(e.trace_name) LIKE lower({");
      expect(query).toContain("OR lower(e.name) LIKE lower({");
      expect(Object.values(params)).toContain(pattern);
    },
  );

  it("escapes LIKE wildcards in the prefilter pattern", () => {
    const { params } = traceNameString("contains", "a%b_c").apply();
    expect(Object.values(params)).toContain("%a\\%b\\_c%");
  });

  it("skips the prefilter for an empty value", () => {
    const { query } = traceNameString("contains", "").apply();
    expect(query).not.toContain("lower(e.name)");
  });

  it("does not accelerate `does not contain` (a skip index cannot prune absence)", () => {
    const { query } = traceNameString("does not contain", "foo").apply();
    expect(query).not.toContain("lower(e.name)");
  });

  it("prepends an OR-of-IN prefilter over both indexed columns for `any of`", () => {
    const { query, params } = traceNameOptions("any of", [
      "Foo",
      "bar",
    ]).apply();
    expect(query).toContain("lower(e.trace_name) IN ({");
    expect(query).toContain("OR lower(e.name) IN ({");
    expect(query).toContain(`AND (${eventsTableTraceNameSql} IN ({`);
    // Values are ASCII-lowered in JS to match the index's lower(); a single
    // shared array param backs both column disjuncts.
    expect(Object.values(params)).toContainEqual(["foo", "bar"]);
  });

  it("does not accelerate `none of`", () => {
    const { query } = traceNameOptions("none of", ["foo"]).apply();
    expect(query).not.toContain("lower(e.name)");
  });

  it("skips the `any of` prefilter when an empty value is selected", () => {
    const { query } = traceNameOptions("any of", ["foo", ""], true).apply();
    expect(query).not.toContain("lower(e.name)");
  });

  it("leaves non-indexed bare-column string filters untouched", () => {
    // version has no ngram index and is not the trace_name expression, so it
    // compiles to a plain position() with no prefilter.
    const { query } = new StringFilter({
      clickhouseTable: "events_full",
      field: "e.version",
      operator: "contains",
      value: "foo",
    }).apply();
    expect(query).toMatch(
      /^position\(e\.version, \{stringFilter\w+: String\}\) > 0$/,
    );
  });
});

describe("filtersRequireEventsFull input/output routing", () => {
  const ioFilter = (field: "input" | "output") =>
    new StringFilter({
      clickhouseTable: "events_core",
      field,
      operator: "=",
      value: "short",
    });

  it("always forces events_full for input/output filters (truncated + no I/O FTS index)", () => {
    expect(filtersRequireEventsFull(new FilterList([ioFilter("input")]))).toBe(
      true,
    );
    expect(filtersRequireEventsFull(new FilterList([ioFilter("output")]))).toBe(
      true,
    );
  });

  it("ignores filters on non-events tables", () => {
    expect(
      filtersRequireEventsFull(
        new FilterList([
          new StringObjectFilter({
            clickhouseTable: "traces",
            field: "metadata",
            key: "k",
            operator: "contains",
            value: "x",
          }),
        ]),
      ),
    ).toBe(false);
  });

  it("forces events_full if any filter in the list is truncation-sensitive", () => {
    expect(
      filtersRequireEventsFull(
        new FilterList([
          metadataString("=", under200),
          metadataString("contains", "needle"),
        ]),
      ),
    ).toBe(true);
  });
});
