import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  convertDateToClickhouseDateTime,
  isClickhouseDateTimeInRange,
  toClickhouseDateTime,
} from "./client";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";

const recordIncrement = vi.fn();
const setAttribute = vi.fn();

vi.mock("../instrumentation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordIncrement: (...args: unknown[]) => recordIncrement(...args),
  getCurrentSpan: () => ({ setAttribute }),
}));

describe("toClickhouseDateTime", () => {
  const ticks = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
  const quoted = "2024-11-06 20:37:00.123";

  it("formats Date values", () => {
    expect(toClickhouseDateTime(new Date(ticks))).toBe(quoted);
  });

  it("formats unix millisecond timestamps", () => {
    expect(toClickhouseDateTime(ticks)).toBe(quoted);
  });

  it("formats ISO strings", () => {
    expect(toClickhouseDateTime("2024-11-06T20:37:00.123Z")).toBe(quoted);
  });

  it("passes through ClickHouse datetime strings", () => {
    expect(toClickhouseDateTime(quoted)).toBe(quoted);
  });

  it("matches convertDateToClickhouseDateTime for Date inputs", () => {
    const date = new Date(ticks);
    expect(toClickhouseDateTime(date)).toBe(
      convertDateToClickhouseDateTime(date),
    );
  });
});

describe("convertDateToClickhouseDateTime", () => {
  beforeEach(() => {
    recordIncrement.mockClear();
    setAttribute.mockClear();
  });

  it.each([
    ["0001-01-01T00:00:00.000Z", "0001-01-01 00:00:00.000"],
    ["9999-12-31T23:59:59.999Z", "9999-12-31 23:59:59.999"],
  ])("keeps %s, the edge of years 0001-9999", (iso, expected) => {
    expect(convertDateToClickhouseDateTime(new Date(iso))).toBe(expected);
    expect(recordIncrement).not.toHaveBeenCalled();
    expect(setAttribute).not.toHaveBeenCalled();
  });

  it.each([
    ["-000001-12-31T23:59:59.999Z", "0001-01-01 00:00:00.000", "min"],
    ["0000-12-31T23:59:59.999Z", "0001-01-01 00:00:00.000", "min"],
    ["+010000-01-01T00:00:00.000Z", "9999-12-31 23:59:59.999", "max"],
  ])(
    "clamps %s, which ClickHouse cannot store, to %s",
    (iso, expected, bound) => {
      expect(convertDateToClickhouseDateTime(new Date(iso))).toBe(expected);
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.clickhouse.datetime_clamped",
        1,
        { bound },
      );
      expect(setAttribute).toHaveBeenCalledWith(
        "langfuse.clickhouse.datetime_clamped",
        bound,
      );
    },
  );
});

describe("isClickhouseDateTimeInRange", () => {
  it.each([
    ["0000-12-31T23:59:59.999Z", false],
    ["0001-01-01T00:00:00.000Z", true],
    ["9999-12-31T23:59:59.999Z", true],
    ["+010000-01-01T00:00:00.000Z", false],
  ])("is %s in range: %s", (iso, expected) => {
    expect(isClickhouseDateTimeInRange(new Date(iso))).toBe(expected);
  });
});

describe("parseClickhouseUTCDateTimeFormat", () => {
  it("reads DateTime64 insert strings back as the same UTC instant", () => {
    const ticks = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
    const quoted = toClickhouseDateTime(ticks);

    expect(quoted).toBe("2024-11-06 20:37:00.123");
    expect(parseClickhouseUTCDateTimeFormat(quoted).toISOString()).toBe(
      "2024-11-06T20:37:00.123Z",
    );
    expect(parseClickhouseUTCDateTimeFormat(quoted).getTime()).toBe(ticks);
  });
});
