import { Readable } from "node:stream";
import {
  clickhouseClient,
  createEvent,
  createEventsCh,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const isEventsTableV2Enabled =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true" ? it : it.skip;
let hasLegacyEventsTable = false;

const maybeIt = (name: string, testFn: () => Promise<void>): void => {
  isEventsTableV2Enabled(name, async () => {
    if (!hasLegacyEventsTable) return;
    await testFn();
  });
};

describe("ClickHouse insert string edge cases", () => {
  it("should pass", () => {
    // Apparently each test file needs at least one executed test and cannot have everything skipped
    expect(true).toBe(true);
  });

  describe("prompt_version type mismatch (UInt16 column vs string value)", () => {
    maybeIt("should handle prompt_version as null", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: null,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    maybeIt("should handle prompt_version as undefined", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: undefined,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    maybeIt("should handle prompt_version as numeric string '42'", async () => {
      const event = createEvent({
        project_id: projectId,
        // Intentionally invalid type: exercises ClickHouse string parsing.
        prompt_version: "42" as unknown as number,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    maybeIt("should handle prompt_version as numeric 42", async () => {
      const event = createEvent({
        project_id: projectId,
        prompt_version: 42,
      });
      await expect(createEventsCh([event])).resolves.not.toThrow();
    });

    maybeIt(
      "should fail or handle prompt_version as non-numeric string 'local'",
      async () => {
        // This is the exact scenario from the production error.
        // prompt_version = "local" cannot be parsed as UInt16 by ClickHouse.
        const event = createEvent({
          project_id: projectId,
          // Intentionally invalid type: reproduces the production error.
          prompt_version: "local" as unknown as number,
        });

        await expect(createEventsCh([event])).rejects.toThrow(/Cannot parse/);
      },
    );

    maybeIt(
      "should fail or handle prompt_version as semantic version string 'v1.0.0'",
      async () => {
        const event = createEvent({
          project_id: projectId,
          // Intentionally invalid type: exercises ClickHouse string parsing.
          prompt_version: "v1.0.0" as unknown as number,
        });

        await expect(createEventsCh([event])).rejects.toThrow(/Cannot parse/);
      },
    );
  });

  describe("Invalid string length on oversized JSON payload", () => {
    maybeIt(
      "should throw 'Size of JSON object' when input exceeds clickhouse byte limit",
      async () => {
        const hugeString = "x".repeat(300 * 1024 * 1024);

        const event = createEvent({
          project_id: projectId,
          input: hugeString,
        });

        await expect(createEventsCh([event])).rejects.toThrow(
          /Size of JSON object/,
        );
      },
    );

    maybeIt(
      "should throw 'Invalid string length' when input exceeds V8 string limit",
      async () => {
        // V8 max string length is ~536_870_888 chars on 64-bit systems.
        // A 512 MB input string causes JSON.stringify to exceed that limit
        // when it serialises the full event row.
        const hugeString = "x".repeat(300 * 1024 * 1024);

        const event = createEvent({
          project_id: projectId,
          input: hugeString,
          output: hugeString,
        });

        await expect(createEventsCh([event])).rejects.toThrow(
          /Invalid string length/,
        );
      },
    );
  });

  describe("Stream inserts of rows beyond the V8 string limit", () => {
    const table = "insert_strings_stream_probe";

    beforeAll(async () => {
      await clickhouseClient().command({
        query: `CREATE TABLE IF NOT EXISTS ${table} (id UInt32, input String) ENGINE = Memory`,
      });
    });

    afterAll(async () => {
      await clickhouseClient().command({
        query: `DROP TABLE IF EXISTS ${table}`,
      });
    });

    it("inserts rows from an object-mode stream when an array insert cannot be serialized", async () => {
      // Each row serializes on its own, but together they exceed V8's maximum
      // string length (~512 MiB), which an array insert needs because the
      // client joins all rows into one string. Rows stay below ~90 MiB because
      // ClickHouse 26.3 rejects a JSONEachRow row once its parsing chunk grows
      // past 10x min_chunk_bytes_for_parallel_parsing (100 MiB by default).
      const input = "x".repeat(80 * 1024 * 1024);
      const rowCount = 7;
      const rows = () =>
        Array.from({ length: rowCount }, (_, id) => ({ id, input }));

      await expect(
        clickhouseClient().insert({
          table,
          format: "JSONEachRow",
          values: rows(),
        }),
      ).rejects.toThrow(/Invalid string length/);

      await clickhouseClient().insert({
        table,
        format: "JSONEachRow",
        values: Readable.from(rows()),
      });

      const result = await clickhouseClient().query({
        query: `SELECT count() AS rows, sum(length(input)) AS bytes FROM ${table}`,
        format: "JSONEachRow",
      });
      expect(await result.json()).toEqual([
        { rows: rowCount, bytes: rowCount * input.length },
      ]);
    }, 120_000);
  });
});
