import { describe, expect, it } from "vitest";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
  StringOptionsFilter,
} from "./clickhouse-filter";
import { buildIoLanePrefilter } from "./filter-utils";

describe("buildIoLanePrefilter", () => {
  it("mirrors start_time range, span_id IN, and trace_id equality", () => {
    const result = buildIoLanePrefilter(
      new FilterList([
        new DateTimeFilter({
          clickhouseTable: "events_core",
          field: "start_time",
          tablePrefix: "e",
          operator: ">=",
          value: new Date("2026-09-01T00:00:00Z"),
        }),
        new StringOptionsFilter({
          clickhouseTable: "events_core",
          field: '"span_id"',
          tablePrefix: "e",
          operator: "any of",
          values: ["span-1", "span-2"],
        }),
        new StringFilter({
          clickhouseTable: "events_core",
          field: '"trace_id"',
          tablePrefix: "e",
          operator: "=",
          value: "trace-1",
        }),
      ]),
    );

    expect(result).not.toBeNull();
    expect(result!.query).toContain("e.start_time >=");
    expect(result!.query).toContain('e."span_id" IN');
    expect(result!.query).toContain('e."trace_id" =');
  });

  it("excludes non-prunable fields and operators", () => {
    const result = buildIoLanePrefilter(
      new FilterList([
        // right field, wrong operator (substring can't prune)
        new StringFilter({
          clickhouseTable: "events_core",
          field: "input",
          tablePrefix: "e",
          operator: "contains",
          value: "hello",
        }),
        // prunable operator, but not an events table
        new StringFilter({
          clickhouseTable: "traces",
          field: '"trace_id"',
          tablePrefix: "t",
          operator: "=",
          value: "trace-1",
        }),
      ]),
    );

    expect(result).toBeNull();
  });

  it("returns null for an empty filter list", () => {
    expect(buildIoLanePrefilter(new FilterList([]))).toBeNull();
  });
});
