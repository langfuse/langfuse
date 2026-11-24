import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { clickhouseClient, queryClickhouse } from "@langfuse/shared/src/server";
import {
  verifyOtelShadowRows,
  type OtelShadowRowSample,
  type OtelShadowRowDifference,
} from "./otelShadowRowVerifier";

/**
 * This suite creates two independent temporary fixtures with the verifier's
 * logical table shape. The query wrapper rewrites both logical table names
 * before the real shared ClickHouse client sends the SQL, so production
 * events_* tables are never read, inserted into, or dropped by this test.
 */
describe("otel shadow row verifier against temporary ClickHouse fixtures", () => {
  const client = clickhouseClient();
  const tables: string[] = [];

  afterAll(async () => {
    for (const table of tables) {
      await client.command({ query: `DROP TABLE IF EXISTS ${table}` });
    }
    await client.close();
  });

  it("compares multiple keys, clocks, payload differences, missing sides, duplicates, and source isolation", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const primaryTable = `otel_shadow_verifier_primary_${suffix}`;
    const shadowTable = `otel_shadow_verifier_shadow_${suffix}`;
    tables.push(primaryTable, shadowTable);

    for (const table of [primaryTable, shadowTable]) {
      await client.command({
        query: `
CREATE TABLE ${table} (
  project_id String,
  trace_id String,
  span_id String,
  start_time DateTime64(6),
  blob_storage_file_path String,
  name String,
  provided_usage_details Map(String, UInt64),
  usage_details Map(String, UInt64),
  provided_cost_details Map(String, Decimal(18, 12)),
  cost_details Map(String, Decimal(18, 12)),
  tool_definitions Map(String, String),
  input String,
  output String,
  event_bytes UInt64,
  created_at DateTime64(6),
  updated_at DateTime64(6),
  event_ts DateTime64(6),
  is_deleted UInt8
)
ENGINE = MergeTree
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)`,
      });
    }

    const fileKey = "otel/project-1/delivery-1.json";
    const otherFileKey = "otel/project-1/other-delivery.json";
    const projectId = "project-1";
    const traceId = "trace-1";
    const startTime = "2026-11-24 10:00:00.123000";

    const locator = (spanId: string) => ({
      traceId,
      spanId,
      startTime,
    });

    const clockAt = (second: string) => ({
      created_at: `2026-11-24 10:00:${second}.000000`,
      updated_at: `2026-11-24 10:00:${second}.000000`,
      event_ts: `2026-11-24 10:00:${second}.000000`,
    });
    const row = (
      spanId: string,
      sourceFile: string,
      input: string,
      clocks: ReturnType<typeof clockAt> = clockAt("01"),
    ) => ({
      project_id: projectId,
      trace_id: traceId,
      span_id: spanId,
      start_time: startTime,
      blob_storage_file_path: sourceFile,
      name: "shadow-test-span",
      input,
      output: "same-output",
      event_bytes: input.length,
      ...clocks,
      is_deleted: 0,
    });

    const equalPrimary = row("span-equal", fileKey, "same-payload");
    const equalShadow = row(
      "span-equal",
      fileKey,
      "same-payload",
      clockAt("02"),
    );
    const changedSpan = "000000000000001f";
    const differentPrimary = row(changedSpan, fileKey, "primary-payload");
    const differentShadow = row(
      changedSpan,
      fileKey,
      "shadow-payload",
      clockAt("02"),
    );
    const missingShadow = row("span-missing-shadow", fileKey, "primary-only");
    const missingPrimary = row(
      "span-missing-primary",
      fileKey,
      "shadow-only",
      clockAt("02"),
    );
    const duplicate = row("span-duplicate", fileKey, "duplicate-payload");
    const contamination = row(
      "span-equal",
      otherFileKey,
      "another-delivery",
      clockAt("03"),
    );

    await client.insert({
      table: primaryTable,
      format: "JSONEachRow",
      values: [
        equalPrimary,
        {
          ...row("map-order", fileKey, "same"),
          usage_details: { input: 11, output: 7 },
        },
        differentPrimary,
        missingShadow,
        duplicate,
        duplicate,
        contamination,
      ],
    });
    await client.insert({
      table: shadowTable,
      format: "JSONEachRow",
      values: [
        equalShadow,
        {
          ...row("map-order", fileKey, "same"),
          usage_details: { output: 7, input: 11 },
        },
        differentShadow,
        missingPrimary,
        duplicate,
        contamination,
      ],
    });

    let queryCount = 0;
    const redirectedQuery = (async (
      options: Parameters<typeof queryClickhouse>[0],
    ) => {
      queryCount++;
      return queryClickhouse({
        ...options,
        query: options.query
          .replaceAll("events_full", primaryTable)
          .replaceAll("events_native_test", shadowTable),
      });
    }) as typeof queryClickhouse;

    const samples: readonly OtelShadowRowSample[] = [
      {
        projectId,
        fileKey,
        inputBytes: 4_096,
        primary: [
          locator("span-equal"),
          locator("map-order"),
          locator(changedSpan),
          locator("span-missing-shadow"),
          locator("span-missing-both"),
          locator("span-duplicate"),
        ],
        shadow: [
          locator("span-equal"),
          locator("map-order"),
          locator(changedSpan),
          locator("span-missing-primary"),
          locator("span-duplicate"),
        ],
      },
    ];

    const examples: OtelShadowRowDifference[] = [];
    await expect(
      verifyOtelShadowRows(samples, redirectedQuery, (example) =>
        examples.push(example),
      ),
    ).resolves.toEqual({
      matched: 1,
      map_order_only: 1,
      different: 1,
      missing_primary: 1,
      missing_shadow: 1,
      missing_both: 1,
      ambiguous: 1,
    });
    expect(examples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "different",
          changedColumns: ["event_bytes", "input"],
        }),
        expect.objectContaining({
          outcome: "map_order_only",
          orderOnlyColumns: ["usage_details"],
        }),
        expect.objectContaining({
          outcome: "missing_shadow",
          primaryCopies: 1,
          shadowCopies: 0,
        }),
      ]),
    );
    for (const value of [
      fileKey,
      traceId,
      "span-missing-shadow",
      "primary-payload",
      "shadow-payload",
    ]) {
      expect(JSON.stringify(examples)).not.toContain(value);
    }
    expect(queryCount).toBe(2);
    expect(examples).toHaveLength(6);
    const rowKey = examples.find(
      ({ outcome }) => outcome === "different",
    )?.rowKey;
    expect(rowKey).toMatchObject({ projectId, startTime, spanId: changedSpan });
    const files = await client.query({
      query: `SELECT DISTINCT blob_storage_file_path FROM ${primaryTable}
        WHERE project_id = {projectId:String}
          AND toStartOfMinute(start_time) = toStartOfMinute({startTime:DateTime64(6, 'UTC')})
          AND xxHash32(trace_id) = {traceHash:UInt32}
          AND span_id = {spanId:String} AND start_time = {startTime:DateTime64(6, 'UTC')}`,
      query_params: rowKey,
      format: "JSONEachRow",
    });
    await expect(files.json()).resolves.toEqual([
      { blob_storage_file_path: fileKey },
    ]);
  });
});
