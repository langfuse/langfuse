import { describe, expect, it } from "vitest";

import {
  BooleanObjectFilter,
  DateTimeFilter,
  FilterList,
  filtersRequireEventsFull,
  inputOutputContentFilterMissingCompanion,
  metadataFilterIsEventsCoreSafe,
  NullFilter,
  NumberObjectFilter,
  StringFilter,
  StringObjectFilter,
  StringOptionsFilter,
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

const ioFilter = (
  operator: StringFilter["operator"],
  field: "input" | "output" = "output",
) =>
  new StringFilter({
    clickhouseTable: "events_full",
    field,
    operator,
    value: "needle",
  });

const idFilter = (
  field: "trace_id" | "span_id" | "user_id" | "session_id",
  operator: StringFilter["operator"] = "=",
) =>
  new StringFilter({
    clickhouseTable: "events_full",
    field,
    operator,
    value: "id-value",
  });

const idAnyOfFilter = (
  field: "trace_id" | "span_id" | "user_id" | "session_id",
) =>
  new StringOptionsFilter({
    clickhouseTable: "events_full",
    field,
    operator: "any of",
    values: ["id-value"],
  });

const startTime = (operator: DateTimeFilter["operator"], value: Date) =>
  new DateTimeFilter({
    clickhouseTable: "events_full",
    field: "start_time",
    operator,
    value,
  });

const T0 = new Date("2026-01-01T00:00:00.000Z");
const plusDays = (base: Date, days: number) =>
  new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

describe("inputOutputContentFilterMissingCompanion", () => {
  it("returns false when there is no input/output substring scan", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([idFilter("trace_id")]),
      ),
    ).toBe(false);
  });

  it("treats an input/output exact `=` as index-accelerated (not a scan)", () => {
    expect(
      inputOutputContentFilterMissingCompanion(new FilterList([ioFilter("=")])),
    ).toBe(false);
  });

  it("treats input/output `is not empty` as a plain non-scan check", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([ioFilter("is not empty")]),
      ),
    ).toBe(false);
  });

  it.each([
    "contains",
    "does not contain",
    "matches",
    "starts with",
    "ends with",
  ] as const)("flags a lone input/output `%s` scan", (operator) => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([ioFilter(operator)]),
      ),
    ).toBe(true);
  });

  it("accepts an exact `=` on input/output as a companion for a sibling scan", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([
          ioFilter("contains", "input"),
          ioFilter("=", "output"),
        ]),
      ),
    ).toBe(false);
  });

  it.each(["trace_id", "span_id", "user_id", "session_id"] as const)(
    "accepts a `%s` equality companion",
    (field) => {
      expect(
        inputOutputContentFilterMissingCompanion(
          new FilterList([ioFilter("matches"), idFilter(field)]),
        ),
      ).toBe(false);
    },
  );

  it.each(["trace_id", "span_id", "user_id", "session_id"] as const)(
    "accepts a `%s` `any of` (IN) companion",
    (field) => {
      expect(
        inputOutputContentFilterMissingCompanion(
          new FilterList([ioFilter("matches"), idAnyOfFilter(field)]),
        ),
      ).toBe(false);
    },
  );

  it("does not accept a non-equality id companion", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([ioFilter("matches"), idFilter("trace_id", "contains")]),
      ),
    ).toBe(true);
  });

  it("does not accept a non-selective column equality (e.g. name)", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([
          ioFilter("matches"),
          new StringFilter({
            clickhouseTable: "events_full",
            field: "name",
            operator: "=",
            value: "chat",
          }),
        ]),
      ),
    ).toBe(true);
  });

  it("accepts a metadata equality companion", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([ioFilter("matches"), metadataString("=", "value")]),
      ),
    ).toBe(false);
  });

  it("does not accept a metadata substring as a companion", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([ioFilter("matches"), metadataString("contains", "v")]),
      ),
    ).toBe(true);
  });

  it("rejects a lower-bound-only start_time window", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([ioFilter("matches"), startTime(">=", T0)]),
      ),
    ).toBe(true);
  });

  it("rejects an upper-bound-only start_time window", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([ioFilter("matches"), startTime("<", T0)]),
      ),
    ).toBe(true);
  });

  it("accepts a both-ends start_time window of any span", () => {
    expect(
      inputOutputContentFilterMissingCompanion(
        new FilterList([
          ioFilter("matches"),
          startTime(">=", T0),
          startTime("<", plusDays(T0, 90)),
        ]),
      ),
    ).toBe(false);
  });
});
