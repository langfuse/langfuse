import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clickhouseClient,
  type ClickhouseClientType,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";
import { ClickhouseWriter, TableName } from "../services/ClickhouseWriter";
import { capturedPreparedRows } from "./helpers/nativeCodecFixtures";

type Row = Record<string, unknown>;
type Column = { name: string; type: string; default_kind: string };
type Manifest = {
  eventBytes: number[];
};
const nativeDir = resolve(__dirname, "../../../packages/native");

// This suite is run explicitly by test:native-codec and CI. Ordinary worker tests need neither
// cargo nor a Native-protocol client. The explicit run always fails if ClickHouse is unavailable.
describe.runIf(
  process.env.LANGFUSE_NATIVE_FAIL_IF_CLICKHOUSE_UNAVAILABLE === "1",
)("TypeScript and Rust Native ingestion parity", () => {
  let directory: string;
  let columns: Column[];
  let writer: ClickhouseWriter;
  let jsonTable: string;
  let nativeTable: string;
  const client = clickhouseClient();

  const query = (sql: string, input: Buffer = Buffer.alloc(0)) =>
    execFileSync(
      process.env.LANGFUSE_NATIVE_CLICKHOUSE_BIN ?? "clickhouse",
      [
        "client",
        "--host",
        process.env.LANGFUSE_NATIVE_CLICKHOUSE_HOST ?? "127.0.0.1",
        "--port",
        process.env.LANGFUSE_NATIVE_CLICKHOUSE_PORT ?? "9000",
        "--user",
        process.env.CLICKHOUSE_USER ?? "clickhouse",
        "--password",
        process.env.CLICKHOUSE_PASSWORD ?? "clickhouse",
        "--database",
        process.env.CLICKHOUSE_DB ?? "default",
        "--multiquery",
        "--query",
        sql,
      ],
      { input, maxBuffer: 16 * 1024 * 1024, timeout: 30_000 },
    );

  const encode = (rows: Row[], maxRowsPerBlock: number): Manifest => {
    const input = resolve(directory, "input.json");
    writeFileSync(input, JSON.stringify({ rows, maxRowsPerBlock }));
    execFileSync(
      "cargo",
      ["run", "--locked", "--example", "native_codec_test_driver"],
      {
        cwd: nativeDir,
        env: {
          ...process.env,
          LANGFUSE_NATIVE_TEST_INPUT: input,
          LANGFUSE_NATIVE_TEST_OUTPUT: directory,
        },
        timeout: 120_000,
        stdio: "pipe",
      },
    );
    return JSON.parse(
      readFileSync(resolve(directory, "manifest.json"), "utf8"),
    ) as Manifest;
  };

  beforeAll(async () => {
    query("SELECT 1");
    directory = mkdtempSync(resolve(tmpdir(), "native-codec-"));
    execFileSync("sh", ["scripts/prepare-clickhouse-rs.sh"], {
      cwd: nativeDir,
      timeout: 120_000,
    });
    columns = query(
      "SELECT name, type, default_kind FROM system.columns WHERE database=currentDatabase() AND table='events_full' ORDER BY position FORMAT JSONEachRow",
    )
      .toString()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Column);
    // Exercise production writer clamping and the real JS client's JSONEachRow serializer.
    // Only redirect the destination table; leave the records and insert settings untouched.
    writer = ClickhouseWriter.getInstance({
      insert: async (params: Parameters<ClickhouseClientType["insert"]>[0]) => {
        return client.insert({ ...params, table: jsonTable });
      },
    } as ClickhouseClientType);
    if (writer.intervalId) clearInterval(writer.intervalId);
    writer.intervalId = null;
    writer.batchSize = Number.MAX_SAFE_INTEGER;
  }, 120_000);

  afterAll(async () => {
    if (writer) await writer.shutdown();
    await client.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  const compare = async (rows: Row[], maxRows: number) => {
    const suffix = randomUUID().replaceAll("-", "");
    jsonTable = `native_codec_json_${suffix}`;
    nativeTable = `native_codec_native_${suffix}`;
    const manifest = encode(rows, maxRows);
    try {
      query(
        `CREATE TABLE ${jsonTable} AS events_full ENGINE=Memory; CREATE TABLE ${nativeTable} AS events_full ENGINE=Memory`,
      );
      for (const row of rows)
        writer.addToQueue(
          TableName.EventsFull,
          structuredClone(row) as EventRecordInsertType,
        );
      await writer.flushAll(true);
      query(
        `INSERT INTO ${nativeTable} FORMAT Native`,
        readFileSync(resolve(directory, "native.bin")),
      );
      // Compare typed values inside ClickHouse: preserve Decimal/UInt64 precision, duplicates,
      // defaults, materialized and alias columns. Map key order is not semantically meaningful.
      const maps = columns
        .filter((c) => c.type.startsWith("Map("))
        .map((c) => c.name);
      const projection = `* EXCEPT (event_bytes, ${maps.join(", ")}), ${maps.map((name) => `mapSort((k, v) -> k, ${name}) AS ${name}`).join(", ")}`;
      const select = (table: string) => `SELECT ${projection} FROM ${table}`;
      const result = JSON.parse(
        query(`SELECT
          (SELECT count() FROM ${jsonTable}) AS json_count,
          (SELECT count() FROM ${nativeTable}) AS native_count,
          (SELECT count() FROM (${select(jsonTable)} EXCEPT ALL ${select(nativeTable)})) AS json_only,
          (SELECT count() FROM (${select(nativeTable)} EXCEPT ALL ${select(jsonTable)})) AS native_only,
          (SELECT sum(event_bytes) FROM ${jsonTable}) AS json_bytes,
          (SELECT sum(event_bytes) FROM ${nativeTable}) AS native_bytes
          SETTINGS asterisk_include_materialized_columns=1, asterisk_include_alias_columns=1 FORMAT JSONEachRow`).toString(),
      ) as Record<string, string | number>;
      expect(Number(result.json_count)).toBe(rows.length);
      expect(Number(result.native_count)).toBe(rows.length);
      expect(Number(result.json_only)).toBe(0);
      expect(Number(result.native_only)).toBe(0);
      expect(BigInt(result.json_bytes)).toBe(
        rows.reduce((sum, row) => sum + BigInt(row.event_bytes as number), 0n),
      );
      expect(BigInt(result.native_bytes)).toBe(
        manifest.eventBytes.reduce((sum, bytes) => sum + BigInt(bytes), 0n),
      );
    } finally {
      // Discard failed writes before shutdown can retry against the temporary table.
      writer.queue[TableName.EventsFull] = [];
      query(
        `DROP TABLE IF EXISTS ${jsonTable}; DROP TABLE IF EXISTS ${nativeTable}`,
      );
    }
  };

  it("compares captured traffic through production TS preparation and both writers", async () => {
    const rows = await capturedPreparedRows();
    expect(rows.length).toBeGreaterThan(0);
    // This capture has inferred costs despite explicitly provided zero costs.
    const enriched = rows.find(
      (row) => row.span_id === "0d8f5427-c91a-44c8-86c5-e12d806edd57",
    );
    expect(enriched?.provided_cost_details).toEqual({
      input: 0,
      output: 0,
      total: 0,
    });
    expect(enriched?.cost_details).toEqual({
      input: 0.00147,
      output: 0.0024,
      total: 0.00387,
    });
    await compare(rows, 16);
  }, 120_000);
});
