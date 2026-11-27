import { describe, expect, it } from "vitest";
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
