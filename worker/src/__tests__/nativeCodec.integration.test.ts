import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PreparedEvent } from "@langfuse/native";
import {
  clickhouseClient,
  type ClickhouseClientType,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";
import { ClickhouseWriter, TableName } from "../services/ClickhouseWriter";
import { codecSpan, prepareCodecRows } from "./helpers/nativeCodecFixtures";

type Row = Record<string, unknown>;
type PreparedRows = Awaited<ReturnType<typeof prepareCodecRows>>;
type Column = { name: string; type: string; default_kind: string };

// Compare the Native writer's Rust row handles with the JSONEachRow writer's
// evaluation snapshots of those same rows.
describe.runIf(
  process.env.LANGFUSE_NATIVE_FAIL_IF_CLICKHOUSE_UNAVAILABLE === "1",
)("Rust-produced row encoding parity", () => {
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
    // Compare the declared columns with ClickHouse; its DEFAULT computes event_bytes.
    const liveColumns = columns.filter(
      (column) =>
        !["MATERIALIZED", "ALIAS"].includes(column.default_kind) &&
        column.name !== "event_bytes",
    );
    const nativeColumns = PreparedEvent.columns();
    expect(
      columns.find((column) => column.name === "event_bytes")?.default_kind,
    ).toBe("DEFAULT");
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
    prepared: PreparedRows,
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
        for (const { event } of prepared.events) {
          writer.addToQueue(TableName.EventsFull, event);
        }
      } else {
        writer = ClickhouseWriter.getInstance(adapter);
        writer.batchSize = maxRows;
        for (const [index, snapshot] of prepared.evaluationRows.entries()) {
          // Convert UInt64 bigint values to the numbers accepted by the TypeScript writer.
          const row = JSON.parse(
            JSON.stringify(snapshot, (_key, value: unknown) =>
              typeof value === "bigint" ? Number(value) : value,
            ),
          ) as Row;
          if (
            row.model_parameters != null &&
            typeof row.model_parameters !== "string"
          ) {
            row.model_parameters = JSON.stringify(row.model_parameters);
          }
          row.skills_available = (row.skills_available as Row[]).map(
            (skill) => ({
              langfuseSkillId: skill.langfuse_skill_id,
              skillVersion: skill.skill_version,
              skillName: skill.skill_name,
            }),
          );
          row.skills_resource_loaded = (
            row.skills_resource_loaded as Row[]
          ).map((skill) => ({
            langfuseSkillId: skill.langfuse_skill_id,
            skillVersion: skill.skill_version,
            skillName: skill.skill_name,
            filePath: skill.file_path,
          }));
          writer.addToQueue(TableName.EventsFull, row as EventRecordInsertType);
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

  const compare = async (prepared: PreparedRows, maxRows: number) => {
    const suffix = randomUUID().replaceAll("-", "");
    const jsonTable = `native_codec_json_${suffix}`;
    const nativeTable = `native_codec_native_${suffix}`;
    try {
      for (const table of [jsonTable, nativeTable]) {
        await client.command({
          query: `CREATE TABLE ${table} AS events_full ENGINE=Memory`,
        });
      }
      await write(prepared, jsonTable, false, maxRows);
      await write(prepared, nativeTable, true, maxRows);

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
      expect(Number(result.json_count)).toBe(prepared.events.length);
      expect(Number(result.native_count)).toBe(prepared.events.length);
      if (Number(result.json_only) !== 0 || Number(result.native_only) !== 0) {
        const differences = await Promise.all(
          [jsonTable, nativeTable].map(async (table) => {
            const result = await client.query({
              query: `SELECT *, toString(usage_details) AS exact_usage,
                toString(provided_usage_details) AS exact_provided_usage
                FROM (${select(table)}) ORDER BY trace_id, span_id LIMIT 5`,
              format: "JSONEachRow",
            });
            return result.json();
          }),
        );
        expect(differences[1]).toEqual(differences[0]);
      }
      expect(Number(result.json_only)).toBe(0);
      expect(Number(result.native_only)).toBe(0);
      expect(BigInt(result.native_bytes)).toBeGreaterThan(0n);
      const readback = await client.query({
        query: `SELECT span_id, environment, prompt_version, evaluator_id, evaluation_rule_id,
          tags, tool_definitions, skills_available, skills_resource_loaded,
          toString(usage_details['aboveSignedRange']) AS large_usage,
          toString(cost_details['precise']) AS precise_cost,
          toString(cost_details['negative']) AS negative_cost,
          toString(cost_details['tiny']) AS tiny_cost,
          toString(cost_details['overflow']) AS clamped_cost
          FROM ${nativeTable} ORDER BY span_id`,
        format: "JSONEachRow",
      });
      const stored = await readback.json<Row>();
      return stored;
    } finally {
      for (const table of [jsonTable, nativeTable]) {
        await client.command({ query: `DROP TABLE IF EXISTS ${table}` });
      }
    }
  };

  it("persists native rows with numeric boundaries, metadata defaults, tuples and duplicate rows", async () => {
    const toolNames = ["__proto__", "é", "\u0000"];
    const generation = codecSpan(1, {
      "langfuse.observation.type": "generation",
      "langfuse.observation.model.name": "codec-model",
      "langfuse.observation.prompt.name": "codec-prompt",
      "langfuse.observation.prompt.version": "65535",
      "langfuse.observation.input": JSON.stringify({
        messages: [{ role: "user", content: "🔥 café\n" }],
        tools: toolNames.map((name) => ({
          type: "function",
          function: { name, parameters: { type: "object" } },
        })),
      }),
      "langfuse.observation.output": "café",
      "langfuse.observation.model.parameters": JSON.stringify({
        temperature: 1,
        nested: ["🔥", -0, 1e-7, 2 ** 63, null],
      }),
      "langfuse.observation.usage_details": JSON.stringify({
        large: Number.MAX_SAFE_INTEGER,
        aboveSignedRange: 2 ** 63,
        zero: -0,
        "\u0000": 0,
        total: 2 ** 63,
      }),
      "langfuse.observation.cost_details": JSON.stringify({
        precise: 510407.65505697404,
        tiny: 1e-13,
        negative: -1.9999999999999,
        overflow: 1e6,
        "\u0000": 0,
      }),
      "langfuse.observation.metadata": JSON.stringify({
        evaluator_id: "evaluator",
        job_configuration_id: "job",
        evaluator_test: true,
      }),
      "langfuse.trace.tags": JSON.stringify(["", "🔥", "line\nbreak"]),
      "langfuse.observation.skills_available": JSON.stringify([
        { name: "skill", version: 7 },
        { name: "unresolved" },
      ]),
    });
    const tool = {
      ...codecSpan(2, {
        "langfuse.observation.type": "tool",
        "langfuse.observation.input": '{"skillName":"skill","path":"SKILL.md"}',
        "langfuse.observation.output": "loaded",
        "langfuse.evaluator.id": "explicit",
        "langfuse.evaluation.rule.id": "explicit-rule",
      }),
      name: "skill_read",
    };
    const prepared = await prepareCodecRows(
      [generation, tool, generation],
      (request) => ({
        model: request.modelName ? { id: "codec-model-id" } : null,
        promptId: request.promptName ? "codec-prompt-id" : undefined,
        pricingTiers: [],
        skillsAvailable: request.skillsAvailable.map(({ name, version }) => ({
          skillName: name,
          skillVersion: version ?? null,
          langfuseSkillId: version ? "skill-id" : null,
        })),
        skillsResourceLoaded: request.skillsResourceLoaded.map((skill) => ({
          ...skill,
          langfuseSkillId: null,
          skillVersion: null,
        })),
      }),
    );
    // Supply the JSONEachRow writer with this fixture's tool-definition map.
    const definitions = Object.fromEntries(
      toolNames.map((name) => [
        name,
        JSON.stringify({ description: "", parameters: '{"type":"object"}' }),
      ]),
    );
    for (const [index, snapshot] of prepared.evaluationRows.entries()) {
      (snapshot as Row).tool_definitions = index === 1 ? {} : definitions;
    }
    const [first, duplicate, second] = await compare(prepared, 2);
    expect(duplicate).toEqual(first);
    expect(first).toMatchObject({
      environment: "default",
      prompt_version: 65535,
      evaluator_id: "evaluator",
      evaluation_rule_id: "job",
      large_usage: "9223372036854776000",
      precise_cost: "510407.65505697404",
      negative_cost: "-1.999999999999",
      tiny_cost: "0",
      clamped_cost: "999999.999999",
      tags: ["", "🔥", "line\nbreak"],
      skills_available: [
        { langfuseSkillId: "skill-id", skillVersion: 7, skillName: "skill" },
        { langfuseSkillId: null, skillVersion: null, skillName: "unresolved" },
      ],
    });
    expect(Object.keys(first.tool_definitions as Row)).toEqual([
      "\u0000",
      "__proto__",
      "é",
    ]);
    expect(second).toMatchObject({
      evaluator_id: "explicit",
      evaluation_rule_id: "explicit-rule",
      prompt_version: null,
      skills_resource_loaded: [
        {
          langfuseSkillId: null,
          skillVersion: null,
          skillName: "skill",
          filePath: "SKILL.md",
        },
      ],
    });
  }, 30_000);
});

// Native tuple values are positional; compare element types without their server-side names.
function normalizeType(type: string): string {
  const tokens = (
    type.match(
      /'(?:\\.|''|[^'\\])*'|`(?:\\.|``|[^`\\])*`|"(?:\\.|""|[^"\\])*"|[A-Za-z_]\w*|\s+|./gs,
    ) ?? []
  ).filter((token) => !/^\s+$/.test(token));
  const parents: string[] = [];
  return tokens
    .filter((token, index) => {
      const previous = tokens[index - 1];
      const tupleElement =
        parents.at(-1) === "Tuple" && (previous === "(" || previous === ",");
      if (token === "(") parents.push(previous);
      else if (token === ")") parents.pop();
      return !(
        tupleElement &&
        /^(?:[A-Za-z_]\w*|`.*`|".*")$/s.test(token) &&
        /^[A-Za-z_]\w*$/.test(tokens[index + 1] ?? "")
      );
    })
    .join("")
    .replaceAll(/LowCardinality\(([^()]*)\)/g, "$1");
}
