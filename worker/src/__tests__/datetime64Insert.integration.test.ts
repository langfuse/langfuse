import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clickhouseClient,
  toClickhouseDateTime,
} from "@langfuse/shared/src/server";

const TABLE_MS = "datetime64_insert_probe_ms";
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

      await clickhouseClient().command({
        query: `
          CREATE TABLE IF NOT EXISTS ${TABLE_MS} (
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
      query: `DROP TABLE IF EXISTS ${TABLE_MS}`,
    });
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
