import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clickhouseClient,
  toClickhouseDateTime,
} from "@langfuse/shared/src/server";

const TABLE_MS = "datetime64_insert_probe_ms";
const TABLE_US = "datetime64_insert_probe_us";
const TICKS_MS = Date.UTC(2024, 10, 6, 20, 37, 0, 123);
const QUOTED_MS = "2024-11-06 20:37:00.123";

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

      for (const [table, precision] of [
        [TABLE_MS, 3],
        [TABLE_US, 6],
      ] as const) {
        await clickhouseClient().command({
          query: `
            CREATE TABLE IF NOT EXISTS ${table} (
              id String,
              t DateTime64(${precision}, 'UTC')
            ) ENGINE = Memory
          `,
        });
      }
    } catch {
      clickHouseAvailable = false;
    }
  });

  afterAll(async () => {
    if (!clickHouseAvailable) return;
    for (const table of [TABLE_MS, TABLE_US]) {
      await clickhouseClient().command({
        query: `DROP TABLE IF EXISTS ${table}`,
      });
    }
  });

  const insertAndRead = async (id: string, value: number | string) => {
    await clickhouseClient().insert({
      table: TABLE_MS,
      format: "JSONEachRow",
      values: [{ id, t: value }],
    });

    const result = await clickhouseClient().query({
      query: `
        SELECT
          toYear(t) AS year,
          formatDateTime(t, '%F %T.%f', 'UTC') AS formatted
        FROM ${TABLE_MS}
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

  it("stores toClickhouseDateTime strings as the real event time", async (ctx) => {
    if (!clickHouseAvailable) {
      ctx.skip("ClickHouse is not available");
    }

    const quoted = toClickhouseDateTime(TICKS_MS);
    expect(quoted).toBe(QUOTED_MS);

    const stored = await insertAndRead("quoted", quoted);

    expect(stored.year).toBe(2024);
    expect(stored.formatted.startsWith(QUOTED_MS)).toBe(true);
  });

  // DateTime64(3) backs traces and observations, DateTime64(6) events_full.
  it.for([
    [3, TABLE_MS],
    [6, TABLE_US],
  ] as const)(
    "stores clamped dates like the range bounds in DateTime64(%i)",
    async ([, table], ctx) => {
      if (!clickHouseAvailable) {
        ctx.skip("ClickHouse is not available");
      }

      const values = {
        // Year 0, which ClickHouse stores as an unrelated date.
        clamped_min: toClickhouseDateTime("0000-12-31T23:59:59.999Z"),
        valid_min: toClickhouseDateTime("0001-01-01T00:00:00.000Z"),
        valid_max: toClickhouseDateTime("9999-12-31T23:59:59.999Z"),
        // Formats with a six-digit year, which ClickHouse cannot parse.
        clamped_max: toClickhouseDateTime("+010000-01-01T00:00:00.000Z"),
      };
      expect(values).toEqual({
        clamped_min: "0001-01-01 00:00:00.000",
        valid_min: "0001-01-01 00:00:00.000",
        valid_max: "9999-12-31 23:59:59.999",
        clamped_max: "9999-12-31 23:59:59.999",
      });

      await clickhouseClient().insert({
        table,
        format: "JSONEachRow",
        values: Object.entries(values).map(([id, t]) => ({ id, t })),
      });

      const response = await clickhouseClient().query({
        query: `
          SELECT id, formatDateTime(t, '%F %T.%f', 'UTC') AS t
          FROM ${table}
          WHERE id IN ('clamped_min', 'valid_min', 'valid_max', 'clamped_max')
        `,
        format: "JSONEachRow",
      });
      const result = await response.json<{ id: string; t: string }>();
      const stored = Object.fromEntries(result.map((row) => [row.id, row.t]));

      expect(result).toHaveLength(4);
      // ClickHouse 26.8+ stores the bounds as sent; earlier versions clamp them
      // further, to 1900 and 2299.
      expect(stored.valid_min).toBeOneOf([
        "0001-01-01 00:00:00.000000",
        "1900-01-01 00:00:00.000000",
      ]);
      expect(stored.clamped_min).toBe(stored.valid_min);
      expect(stored.valid_max).toBeOneOf([
        "9999-12-31 23:59:59.999000",
        "2299-12-31 23:59:59.999000",
      ]);
      expect(stored.clamped_max).toBe(stored.valid_max);
    },
  );

  it("overflows unquoted millisecond ticks on ClickHouse 26.8+ default parsing", async (ctx) => {
    if (!clickHouseAvailable) {
      ctx.skip("ClickHouse is not available");
    }
    if (!isClickHouseAtLeast26_8(clickHouseVersion)) {
      ctx.skip(
        `ClickHouse ${clickHouseVersion || "unknown"} is older than 26.8`,
      );
    }

    const stored = await insertAndRead("unquoted-default", TICKS_MS);

    expect(stored.year).toBeGreaterThanOrEqual(9000);
  });
});
