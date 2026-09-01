import { describe, expect, it } from "vitest";

import { convertDateToClickhouseDateTime } from "./client";
import {
  convertDateTime64TicksToClickhouseDateTime,
  quoteDateTime64InsertRecords,
  quoteDateTime64InsertValue,
} from "./datetime";

describe("convertDateTime64TicksToClickhouseDateTime", () => {
  it("formats millisecond ticks for DateTime64(3)", () => {
    const ticks = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
    expect(convertDateTime64TicksToClickhouseDateTime(ticks, 3)).toBe(
      "2024-11-06 20:37:00.123",
    );
  });

  it("formats microsecond ticks for DateTime64(6)", () => {
    const millisecondTicks = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
    const ticks = millisecondTicks * 1000 + 456;
    expect(convertDateTime64TicksToClickhouseDateTime(ticks, 6)).toBe(
      "2024-11-06 20:37:00.123456",
    );
  });

  it("keeps pre-epoch DateTime64(6) ticks on the same instant", () => {
    expect(convertDateTime64TicksToClickhouseDateTime(-1234567, 6)).toBe(
      "1969-12-31 23:59:58.765433",
    );
  });
});

describe("quoteDateTime64InsertValue", () => {
  it("quotes finite numeric ticks", () => {
    const ticks = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
    expect(quoteDateTime64InsertValue(ticks, 3)).toBe(
      "2024-11-06 20:37:00.123",
    );
  });

  it("leaves already-quoted datetime strings unchanged", () => {
    expect(quoteDateTime64InsertValue("2024-11-06 20:37:00.123", 3)).toBe(
      "2024-11-06 20:37:00.123",
    );
  });

  it("quotes Date instances", () => {
    const date = new Date(Date.UTC(2024, 10, 6, 20, 37, 0, 123));
    expect(quoteDateTime64InsertValue(date, 3)).toBe(
      convertDateToClickhouseDateTime(date),
    );
  });

  it("preserves nullish values", () => {
    expect(quoteDateTime64InsertValue(null, 3)).toBeNull();
    expect(quoteDateTime64InsertValue(undefined, 3)).toBeUndefined();
  });

  it("leaves non-finite numbers unchanged", () => {
    expect(quoteDateTime64InsertValue(Number.NaN, 3)).toBeNaN();
    expect(quoteDateTime64InsertValue(Number.POSITIVE_INFINITY, 3)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe("quoteDateTime64InsertRecords", () => {
  it("quotes DateTime64(3) tick fields on traces and leaves other columns alone", () => {
    const ticks = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
    const quoted = "2024-11-06 20:37:00.123";

    expect(
      quoteDateTime64InsertRecords("traces", [
        {
          id: "trace-1",
          is_deleted: 0,
          timestamp: ticks,
          created_at: ticks,
          updated_at: ticks,
          event_ts: ticks,
        },
      ]),
    ).toEqual([
      {
        id: "trace-1",
        is_deleted: 0,
        timestamp: quoted,
        created_at: quoted,
        updated_at: quoted,
        event_ts: quoted,
      },
    ]);
  });

  it("quotes DateTime64(6) tick fields on events_full", () => {
    const millisecondTicks = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
    const ticks = millisecondTicks * 1000 + 456;

    expect(
      quoteDateTime64InsertRecords("events_full", [
        {
          span_id: "span-1",
          start_time: ticks,
          end_time: null,
          event_ts: ticks,
        },
      ]),
    ).toEqual([
      {
        span_id: "span-1",
        start_time: "2024-11-06 20:37:00.123456",
        end_time: null,
        event_ts: "2024-11-06 20:37:00.123456",
      },
    ]);
  });

  it("does not rewrite records for unknown tables", () => {
    const records = [{ timestamp: 1_730_918_220_123 }];
    expect(quoteDateTime64InsertRecords("unknown_table", records)).toBe(
      records,
    );
  });
});
