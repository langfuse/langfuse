import { describe, expect, it } from "vitest";

import { convertDateToClickhouseDateTime } from "../../clickhouse/client";
import { DateTimeFilter } from "./clickhouse-filter";

describe("DateTimeFilter ClickHouse parameter encoding", () => {
  it("encodes Unix epoch as a ClickHouse DateTime64 string, not numeric 0", () => {
    const epoch = new Date("1970-01-01T00:00:00.000Z");
    const filter = new DateTimeFilter({
      clickhouseTable: "traces",
      field: "timestamp",
      operator: ">=",
      value: epoch,
      tablePrefix: "t",
    });

    const applied = filter.apply();

    expect(applied.query).toContain("DateTime64(3, 'UTC')");
    const paramValue = Object.values(applied.params)[0];
    // ClickHouse rejects query parameter value 0 for DateTime64(3):
    // "Cannot parse DateTime: value 0 cannot be parsed as DateTime64(3)"
    expect(paramValue).not.toBe(0);
    expect(paramValue).toBe(convertDateToClickhouseDateTime(epoch));
  });

  it("encodes ordinary timestamps as ClickHouse DateTime64 strings", () => {
    const value = new Date("2026-08-14T23:30:00.123+02:00");
    const filter = new DateTimeFilter({
      clickhouseTable: "traces",
      field: "timestamp",
      operator: "<=",
      value,
    });

    const applied = filter.apply();
    const paramValue = Object.values(applied.params)[0];

    expect(applied.query).toContain("DateTime64(3, 'UTC')");
    expect(paramValue).toBe(convertDateToClickhouseDateTime(value));
    expect(paramValue).toBe("2026-08-14 21:30:00.123");
  });
});
