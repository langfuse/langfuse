import { describe, expect, it, vi } from "vitest";
import {
  convertDateToClickhouseDateTime,
  toClickhouseDateTime,
} from "./client";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";

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

  it.each([
    // An offset is applied here, and missing parts default to zero.
    ["2024-11-06T22:37:00.123456+02:00", "2024-11-06 20:37:00.123"],
    ["2024-11-06 22:37:00.123456+02:00", "2024-11-06 20:37:00.123"],
    ["2024-11-06 15:07:00-0530", "2024-11-06 20:37:00.000"],
    ["2024-11-06 20:37:00.123Z", "2024-11-06 20:37:00.123"],
    ["2024-11-06 20:37", "2024-11-06 20:37:00.000"],
    ["2024-11-06", "2024-11-06 00:00:00.000"],
    // A day past the end of its month and 24:00:00 roll forward.
    ["2024-02-30 12:00:00", "2024-03-01 12:00:00.000"],
    ["2023-02-29T12:00:00Z", "2023-03-01 12:00:00.000"],
    ["2024-11-06 24:00:00", "2024-11-07 00:00:00.000"],
    // Formats only JavaScript reads.
    ["Wed, 06 Nov 2024 21:37:00 +0100", "2024-11-06 20:37:00.000"],
    ["11/6/2024 8:37:00 PM UTC", "2024-11-06 20:37:00.000"],
  ])("reads %j as %j", (value, expected) => {
    expect(toClickhouseDateTime(value)).toBe(expected);
  });

  it.each([
    "soon",
    "2024-13-01 12:00:00",
    "2024-11-06 20:37:60",
    "2024-11-06 24:00:00.5",
    "9999-12-31 24:00:00",
    "0000-02-29 12:00:00",
  ])("uses the current time for the unreadable string %j", (value) => {
    vi.useFakeTimers({ now: ticks });
    try {
      expect(toClickhouseDateTime(value)).toBe(quoted);
    } finally {
      vi.useRealTimers();
    }
  });

  it("matches convertDateToClickhouseDateTime for Date inputs", () => {
    const date = new Date(ticks);
    expect(toClickhouseDateTime(date)).toBe(
      convertDateToClickhouseDateTime(date),
    );
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
