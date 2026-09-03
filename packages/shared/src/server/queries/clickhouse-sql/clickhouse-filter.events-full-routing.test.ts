import { describe, expect, it } from "vitest";

import {
  BooleanObjectFilter,
  FilterList,
  filtersRequireEventsFull,
  metadataFilterIsEventsCoreSafe,
  NullFilter,
  NumberObjectFilter,
  StringFilter,
  StringObjectFilter,
} from "./clickhouse-filter";

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
