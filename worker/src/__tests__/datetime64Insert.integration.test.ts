import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clickhouseClient,
  quoteDateTime64InsertValue,
} from "@langfuse/shared/src/server";

const TABLE = "datetime64_insert_probe";
const TICKS_MS = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
const QUOTED = "2024-11-06 20:37:00.123";

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
          CREATE TABLE IF NOT EXISTS ${TABLE} (
            id String,
            t DateTime64(3, 'UTC')
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
      query: `DROP TABLE IF EXISTS ${TABLE}`,
    });
  });

  const insertAndRead = async (
    id: string,
    value: number | string,
    settings: Record<string, 0 | 1> = {},
  ) => {
    await clickhouseClient().insert({
      table: TABLE,
      format: "JSONEachRow",
      values: [{ id, t: value }],
      clickhouse_settings: settings,
    });

    const result = await clickhouseClient().query({
      query: `
        SELECT
          toYear(t) AS year,
          formatDateTime(t, '%F %T.%f', 'UTC') AS formatted
        FROM ${TABLE}
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

  it("stores quoted DateTime64 strings as the real event time", async (ctx) => {
    if (!clickHouseAvailable) {
      ctx.skip("ClickHouse is not available");
    }

    const quotedHelper = quoteDateTime64InsertValue(TICKS_MS, 3);
    expect(quotedHelper).toBe(QUOTED);

    const stored = await insertAndRead("quoted", QUOTED, {
      input_format_read_datetime_number_as_raw_value: 0,
    });

    expect(stored.year).toBe(2024);
    expect(stored.formatted.startsWith(QUOTED)).toBe(true);
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

    const stored = await insertAndRead("raw-ticks", TICKS_MS, {
      input_format_read_datetime_number_as_raw_value: 1,
    });

    expect(stored.year).toBe(2024);
    expect(stored.formatted.startsWith(QUOTED)).toBe(true);
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

    const stored = await insertAndRead("unquoted-default", TICKS_MS, {
      input_format_read_datetime_number_as_raw_value: 0,
    });

    expect(stored.year).toBeGreaterThanOrEqual(9000);
  });
});
