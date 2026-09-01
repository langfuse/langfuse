import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clickhouseClient,
  quoteDateTime64InsertRecords,
} from "@langfuse/shared/src/server";

const TABLE_MS = "datetime64_insert_probe_ms";
const TABLE_US = "datetime64_insert_probe_us";
const TICKS_MS = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
const TICKS_US = TICKS_MS * 1000 + 456;
const QUOTED_MS = "2024-11-06 20:37:00.123";
const QUOTED_US = "2024-11-06 20:37:00.123456";

const isClickHouseAtLeast26_8 = (version: string): boolean => {
  const match = version.trim().match(/^v?(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 26 || (major === 26 && minor >= 8);
};

describe("DateTime64 JSONEachRow inserts", () => {
  let clickHouseVersion = "";
  let clickHouseAvailable = false;

  beforeAll(async () => {
    try {
      const result = await clickhouseClient().query({
        query: "SELECT version() AS version",
        format: "JSONEachRow",
      });
      const rows = await result.json<{ version: string }>();
      clickHouseVersion = rows[0]?.version ?? "";
      clickHouseAvailable = Boolean(clickHouseVersion);

      await clickhouseClient().command({
        query: `
          CREATE TABLE IF NOT EXISTS ${TABLE_MS} (
            id String,
            t DateTime64(3, 'UTC')
          ) ENGINE = Memory
        `,
      });
      await clickhouseClient().command({
        query: `
          CREATE TABLE IF NOT EXISTS ${TABLE_US} (
            id String,
            t DateTime64(6, 'UTC')
          ) ENGINE = Memory
        `,
      });
    } catch {
      clickHouseAvailable = false;
    }
  });

  afterAll(async () => {
    if (!clickHouseAvailable) return;
    await clickhouseClient().command({
      query: `DROP TABLE IF EXISTS ${TABLE_MS}`,
    });
    await clickhouseClient().command({
      query: `DROP TABLE IF EXISTS ${TABLE_US}`,
    });
  });

  const insertAndRead = async (
    table: string,
    id: string,
    value: number | string,
    settings: Record<string, 0 | 1> = {},
  ) => {
    await clickhouseClient().insert({
      table,
      format: "JSONEachRow",
      values: [{ id, t: value }],
      clickhouse_settings: settings,
    });

    const result = await clickhouseClient().query({
      query: `
        SELECT
          toYear(t) AS year,
          formatDateTime(t, '%F %T.%f', 'UTC') AS formatted
        FROM ${table}
        WHERE id = {id: String}
      `,
      query_params: { id },
      format: "JSONEachRow",
    });
    const rows = await result.json<{
      year: number | string;
      formatted: string;
    }>();
    return {
      year: Number(rows[0]?.year),
      formatted: rows[0]?.formatted ?? "",
    };
  };

  it("stores quoteDateTime64InsertRecords traces ticks as the real event time", async (ctx) => {
    if (!clickHouseAvailable) {
      ctx.skip("ClickHouse is not available");
    }

    const [quoted] = quoteDateTime64InsertRecords("traces", [
      {
        timestamp: TICKS_MS,
        created_at: TICKS_MS,
        updated_at: TICKS_MS,
        event_ts: TICKS_MS,
      },
    ]);

    expect(quoted.timestamp).toBe(QUOTED_MS);

    const stored = await insertAndRead(
      TABLE_MS,
      "helper-traces",
      quoted.timestamp,
    );

    expect(stored.year).toBe(2024);
    expect(stored.formatted.startsWith(QUOTED_MS)).toBe(true);
  });

  it("stores quoteDateTime64InsertRecords events_full ticks as the real event time", async (ctx) => {
    if (!clickHouseAvailable) {
      ctx.skip("ClickHouse is not available");
    }

    const [quoted] = quoteDateTime64InsertRecords("events_full", [
      {
        start_time: TICKS_US,
        created_at: TICKS_US,
        updated_at: TICKS_US,
        event_ts: TICKS_US,
      },
    ]);

    expect(quoted.start_time).toBe(QUOTED_US);

    const stored = await insertAndRead(
      TABLE_US,
      "helper-events",
      quoted.start_time,
    );

    expect(stored.year).toBe(2024);
    expect(stored.formatted.startsWith(QUOTED_US)).toBe(true);
  });

  it("does not overflow unquoted millisecond ticks when raw-value parsing is on", async (ctx) => {
    if (!clickHouseAvailable) {
      ctx.skip("ClickHouse is not available");
    }
    if (!isClickHouseAtLeast26_8(clickHouseVersion)) {
      ctx.skip(
        `ClickHouse ${clickHouseVersion || "unknown"} is older than 26.8`,
      );
    }

    const stored = await insertAndRead(TABLE_MS, "raw-ticks", TICKS_MS, {
      input_format_read_datetime_number_as_raw_value: 1,
    });

    expect(stored.year).toBe(2024);
    expect(stored.formatted.startsWith(QUOTED_MS)).toBe(true);
  });

  it("overflows unquoted millisecond ticks on ClickHouse 26.8+ default parsing", async (ctx) => {
    if (!clickHouseAvailable) {
      ctx.skip("ClickHouse is not available");
    }
    if (!isClickHouseAtLeast26_8(clickHouseVersion)) {
      ctx.skip(
        `ClickHouse ${clickHouseVersion || "unknown"} is older than 26.8`,
      );
    }

    const stored = await insertAndRead(TABLE_MS, "unquoted-default", TICKS_MS, {
      input_format_read_datetime_number_as_raw_value: 0,
    });

    expect(stored.year).toBeGreaterThanOrEqual(9000);
  });
});
