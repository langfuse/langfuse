import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fc, { type Arbitrary } from "fast-check";
import { PreparedEvent } from "@langfuse/native";
import {
  clickhouseClient,
  type ClickhouseClientType,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";
import { ClickhouseWriter, TableName } from "../services/ClickhouseWriter";
import { prepareNativeEvent } from "../services/IngestionService/prepareNativeEvent";
import { capturedPreparedRows } from "./helpers/nativeCodecFixtures";

type Row = Record<string, unknown>;
type Column = { name: string; type: string; default_kind: string };

// The explicit CI/package command requires ClickHouse. Both branches use the production
// writer; Native rows cross the real NAPI boundary as JS objects, without a JSON test driver.
describe.runIf(
  process.env.LANGFUSE_NATIVE_FAIL_IF_CLICKHOUSE_UNAVAILABLE === "1",
)("TypeScript and Rust Native writer parity", () => {
  let columns: Column[];
  const client = clickhouseClient();

  beforeAll(async () => {
    const result = await client.query({
      query:
        "SELECT name, type, default_kind FROM system.columns WHERE database=currentDatabase() AND table='events_full' ORDER BY position",
      format: "JSONEachRow",
    });
    columns = await result.json<Column>();
    expect(columns.length).toBeGreaterThan(0);
    const normalizeType = (type: string) =>
      type
        .replaceAll(/LowCardinality\(([^()]*)\)/g, "$1")
        .replaceAll(/\s/g, "");
    // Names and types come from the same Rust declaration as JS reads and column writes.
    // Check the full insertable set, including columns that captured traffic omits.
    const liveColumns = columns.filter(
      (column) => !["MATERIALIZED", "ALIAS"].includes(column.default_kind),
    );
    const nativeColumns = PreparedEvent.columns();
    expect(
      nativeColumns
        .map((column) => [column.name, normalizeType(column.columnType)])
        .sort(),
    ).toEqual(
      liveColumns
        .map((column) => [column.name, normalizeType(column.type)])
        .sort(),
    );
    for (const column of nativeColumns.filter((column) => column.usesDefault)) {
      expect(
        liveColumns.find((live) => live.name === column.name)?.default_kind,
        `${column.name} must retain its DEFAULT expression`,
      ).toBe("DEFAULT");
    }
  });

  afterAll(async () => {
    await client.close();
  });

  const write = async (
    rows: Row[],
    table: string,
    native: boolean,
    maxRows: number,
  ) => {
    let inserts = 0;
    const adapter = {
      insert: async (params: Parameters<ClickhouseClientType["insert"]>[0]) => {
        expect(native).toBe(false);
        expect(params.table).toBe(TableName.EventsFull);
        inserts++;
        return client.insert({ ...params, table });
      },
      exec: async (params: Parameters<ClickhouseClientType["exec"]>[0]) => {
        expect(native).toBe(true);
        expect(params.query).toBe("INSERT INTO events_full FORMAT Native");
        inserts++;
        return client.exec({
          ...params,
          query: `INSERT INTO ${table} FORMAT Native`,
        });
      },
    } as ClickhouseClientType;
    let writer:
      | ClickhouseWriter
      | ReturnType<typeof ClickhouseWriter.getNativeInstance>;
    let writerShutdown = false;
    try {
      if (native) {
        writer = ClickhouseWriter.getNativeInstance(adapter);
        writer.batchSize = maxRows;
        for (const row of rows) {
          writer.addToQueue(
            TableName.EventsFull,
            prepareNativeEvent(row as EventRecordInsertType),
          );
        }
      } else {
        writer = ClickhouseWriter.getInstance(adapter);
        writer.batchSize = maxRows;
        for (const row of rows) {
          writer.addToQueue(
            TableName.EventsFull,
            structuredClone(row) as EventRecordInsertType,
          );
        }
      }
      await ClickhouseWriter.shutdownAll();
      writerShutdown = true;
      expect(writer.queue[TableName.EventsFull]).toHaveLength(0);
      expect(inserts).toBeGreaterThan(0);
    } finally {
      if (!writerShutdown) await ClickhouseWriter.shutdownAll();
    }
  };

  const compare = async (rows: Row[], maxRows: number) => {
    const suffix = randomUUID().replaceAll("-", "");
    const jsonTable = `native_codec_json_${suffix}`;
    const nativeTable = `native_codec_native_${suffix}`;
    try {
      for (const table of [jsonTable, nativeTable]) {
        await client.command({
          query: `CREATE TABLE ${table} AS events_full ENGINE=Memory`,
        });
      }
      await write(rows, jsonTable, false, maxRows);
      await write(rows, nativeTable, true, maxRows);

      // Compare inside ClickHouse to preserve Decimal/UInt64 precision, duplicate rows,
      // defaults, materialized and alias columns. Only map entry order is immaterial.
      const maps = columns
        .filter((c) => c.type.startsWith("Map("))
        .map((c) => c.name);
      const projection = `* EXCEPT (${maps.join(", ")}), ${maps.map((name) => `mapSort((k, v) -> k, ${name}) AS ${name}`).join(", ")}`;
      const select = (table: string) => `SELECT ${projection} FROM ${table}`;
      const response = await client.query({
        query: `SELECT
          (SELECT count() FROM ${jsonTable}) AS json_count,
          (SELECT count() FROM ${nativeTable}) AS native_count,
          (SELECT count() FROM (${select(jsonTable)} EXCEPT ALL ${select(nativeTable)})) AS json_only,
          (SELECT count() FROM (${select(nativeTable)} EXCEPT ALL ${select(jsonTable)})) AS native_only,
          (SELECT toString(sum(event_bytes)) FROM ${nativeTable}) AS native_bytes
          SETTINGS asterisk_include_materialized_columns=1, asterisk_include_alias_columns=1`,
        format: "JSONEachRow",
      });
      const [result] = await response.json<Record<string, string | number>>();
      expect(Number(result.json_count)).toBe(rows.length);
      expect(Number(result.native_count)).toBe(rows.length);
      if (Number(result.json_only) !== 0 || Number(result.native_only) !== 0) {
        const differences = await Promise.all(
          [jsonTable, nativeTable].map(async (table) => {
            const result = await client.query({
              query: `${select(table)} ORDER BY trace_id, span_id LIMIT 5`,
              format: "JSONEachRow",
            });
            return result.json();
          }),
        );
        expect(differences[1]).toEqual(differences[0]);
      }
      expect(Number(result.json_only)).toBe(0);
      expect(Number(result.native_only)).toBe(0);
      expect(BigInt(result.native_bytes)).toBe(
        rows.reduce((sum, row) => sum + BigInt(row.event_bytes as number), 0n),
      );
    } finally {
      for (const table of [jsonTable, nativeTable]) {
        await client.command({ query: `DROP TABLE IF EXISTS ${table}` });
      }
    }
  };

  it("compares captured traffic through production TS preparation and both encodings", async () => {
    const rows = await capturedPreparedRows();
    expect(rows.length).toBeGreaterThan(0);
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

  it("persists generated rows identically through the production JS adapter", async () => {
    const seed = Number(process.env.FAST_CHECK_SEED ?? randomInt(2 ** 31));
    process.stderr.write(`Native writer parity: seed=${seed}\n`);
    await fc.assert(
      fc.asyncProperty(
        fc.array(preparedRowArbitrary(columns), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 8 }),
        async (rows, maxRows) => compare(rows, maxRows),
      ),
      { seed, numRuns: 32 },
    );
  }, 120_000);

  it("preserves prepared JS values, defaults and accounting through NAPI", async () => {
    const base: Row = {
      project_id: "native-boundary",
      trace_id: "trace",
      span_id: "span",
      start_time: "2026-09-24 00:00:00.123456",
      created_at: "2026-09-24 00:00:00.123456",
      updated_at: "2026-09-24 00:00:00.123456",
      event_ts: "2026-09-24 00:00:00.123456",
      input: '{"emoji":"🔥","escaped":"\\n"}',
      output: "café",
      model_parameters: {
        temperature: 1,
        nested: ["🔥", -0, 1e-7, 2 ** 63, null],
        omitted: undefined,
      },
      event_bytes: 123,
      metadata_names: [
        "evaluator_id",
        "job_configuration_id",
        "evaluator_test",
      ],
      metadata_values: ["evaluator", "job", "true"],
      environment: undefined,
      prompt_version: null,
      end_time: undefined,
      usage_pricing_tier_id: null,
      usage_details: {
        large: Number.MAX_SAFE_INTEGER,
        // JSONEachRow stores the decimal JS spelling of this double, which differs
        // from the integer obtained by a direct f64-to-u64 cast.
        aboveSignedRange: 2 ** 63,
        zero: -0,
        "\u0000": 0,
      },
      cost_details: {
        precise: 510407.65505697404,
        tiny: 1e-13,
        negative: -1.9999999999999,
        overflow: 1e6,
        "\u0000": 0,
      },
      tool_definitions: Object.fromEntries([
        ["__proto__", "tool"],
        ["é", "🔥"],
        ["\u0000", "nul-key-tool"],
      ]),
      tags: ["", "🔥", "line\nbreak"],
    };
    await compare(
      [
        base,
        {
          ...base,
          environment: "",
          evaluator_id: "",
          evaluation_rule_id: "",
          evaluator_execution_is_test: false,
          prompt_version: 65535,
          model_parameters: null,
          event_bytes: 0,
        },
        { ...base },
      ],
      2,
    );
  }, 30_000);
});

// The live schema supplies the domain independently of Rust's declaration. These bounded
// values exercise every storage column while keeping server-backed failures cheap to shrink.
function preparedRowArbitrary(columns: Column[]): Arbitrary<Row> {
  const fields = Object.fromEntries(
    columns
      .filter(
        (column) => !["MATERIALIZED", "ALIAS"].includes(column.default_kind),
      )
      .map((column) => {
        const value = columnValueArbitrary(column.type);
        return [
          column.name,
          // Preparation supplies timestamps explicitly. Falling back to now64() would compare
          // different insertion times, outside the prepared-row contract.
          column.default_kind === "DEFAULT" &&
          !["created_at", "updated_at"].includes(column.name)
            ? fc.option(value, { nil: undefined })
            : value,
        ];
      }),
  );
  return fc
    .tuple(fc.record(fields), fc.boolean())
    .map(([row, evaluatorKeys]) => {
      // Prepared metadata has parallel arrays. Mix arbitrary names with evaluator keys so both
      // ordinary metadata preservation and metadata-derived DEFAULT expressions are exercised.
      for (const prefix of [
        "metadata",
        "experiment_metadata",
        "experiment_item_metadata",
      ]) {
        const values = row[`${prefix}_values`] as string[];
        const names = evaluatorKeys
          ? [
              "evaluator_id",
              "evaluation_rule_id",
              "job_configuration_id",
              "evaluator_test",
            ]
          : (row[`${prefix}_names`] as string[]);
        row[`${prefix}_names`] = names.slice(0, values.length);
        row[`${prefix}_values`] = values.slice(0, names.length);
      }
      return row;
    });
}

function columnValueArbitrary(type: string): Arbitrary<unknown> {
  const normalized = type
    .replaceAll(/LowCardinality\(([^()]*)\)/g, "$1")
    .replaceAll(/\s/g, "");
  const text = fc.oneof(
    fc.fullUnicodeString({ maxLength: 24 }),
    fc.constantFrom("", "true"),
  );
  const nullable = normalized.match(/^Nullable\((.*)\)$/);
  if (nullable)
    return fc.option(columnValueArbitrary(nullable[1]), { nil: null });
  const map = normalized.match(/^Map\(String,(.*)\)$/);
  if (map)
    return fc
      .array(fc.tuple(text, columnValueArbitrary(map[1])), { maxLength: 4 })
      .map(Object.fromEntries);
  switch (normalized) {
    case "String":
      return text;
    case "Bool":
      return fc.boolean();
    case "UInt8":
      return fc.integer({ min: 0, max: 1 });
    case "UInt16":
      return fc.integer({ min: 0, max: 65535 });
    case "UInt64":
      return fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
    case "Decimal(18,12)":
      return fc.double({
        min: -999999,
        max: 999999,
        noNaN: true,
        noDefaultInfinity: true,
      });
    case "Array(String)":
      return fc.array(text, { maxLength: 4 });
    case "DateTime64(6)":
      return fc
        .tuple(
          fc.integer({ min: 0, max: 2000000000 }),
          fc.integer({ min: 0, max: 999999 }),
        )
        .map(
          ([seconds, micros]) =>
            `${new Date(seconds * 1000).toISOString().slice(0, 19).replace("T", " ")}.${String(micros).padStart(6, "0")}`,
        );
    default:
      throw new Error(`Unsupported live events_full type: ${type}`);
  }
}
