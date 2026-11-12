import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clickhouseClient,
  createDatasetRunItem,
  createObservation,
  createTrace,
} from "@langfuse/shared/src/server";
import BackfillEventsFullFromObservations from "../backgroundMigrations/backfillEventsFullFromObservations";
import { pidTidSortingTable } from "../backgroundMigrations/utils/v4BackfillDdl";

class ObservationBackfill extends BackfillEventsFullFromObservations {
  query(partId: string, partition: string) {
    return this.buildChunkQuery({
      id: partId,
      partId,
      partition,
      status: "pending",
    });
  }
}

const profileEnabled = process.env.LANGFUSE_TEST_BACKFILL_PROFILE === "1";

describe.each(profileEnabled ? [1024, 4096] : [4096])(
  "observation backfill with %i unrelated traces",
  (unrelatedTraceCount) => {
    const prefix = `backfill_${randomUUID().replaceAll("-", "")}`;
    const tables = {
      scratch: `${prefix}_scratch`,
      traces: `${prefix}_traces`,
      dris: `${prefix}_dris`,
      events: `${prefix}_events`,
      baseline: `${prefix}_baseline`,
    };
    const time = new Date("2026-01-15T12:00:00.000Z");
    const dates = { created_at: time, updated_at: time, event_ts: time };
    const createdTables: string[] = [];
    let partId: string;

    async function rows<T>(
      query: string,
      params: Record<string, unknown> = {},
    ) {
      const result = await clickhouseClient().query({
        query,
        query_params: params,
        format: "JSONEachRow",
      });
      return result.json<T>();
    }

    function chunkQuery() {
      const { query, params } = new ObservationBackfill().query(
        partId,
        "202601",
      );
      return {
        query: query
          .replaceAll(pidTidSortingTable(), tables.scratch)
          .replaceAll("FROM traces t", `FROM ${tables.traces} t`)
          .replaceAll("FROM dataset_run_items_rmt", `FROM ${tables.dris}`)
          .replace("INSERT INTO events_full", `INSERT INTO ${tables.events}`),
        params,
      };
    }

    // Control query: the original join/filter shape, sharing only the unchanged
    // event projection with the migration. Keep latest-version LIMIT BY intact.
    function baselineQuery() {
      const { query, params } = chunkQuery();
      return {
        query:
          query
            .slice(0, query.indexOf("      FROM "))
            .replace(
              `INSERT INTO ${tables.events}`,
              `INSERT INTO ${tables.baseline}`,
            ) +
          `
      FROM ${tables.scratch} o
      LEFT ANY JOIN (
        SELECT project_id, id, version, release, tags, public, bookmarked, name, user_id, session_id
        FROM ${tables.traces} t
        WHERE t._partition_id = {partition: String}
        ORDER BY event_ts DESC
        LIMIT 1 BY project_id, id
      ) t ON o.project_id = t.project_id AND o.trace_id = t.id
      WHERE o._partition_id = {partition: String} AND o._part = {partId: String}
        AND (o.project_id, o.trace_id) NOT IN (
          SELECT project_id, trace_id FROM ${tables.dris}
        )
      SETTINGS join_algorithm = 'full_sorting_merge', type_json_skip_duplicated_paths = 1`,
        params,
      };
    }

    const settings = {
      max_threads: 2,
      max_insert_threads: "1",
      max_memory_usage: "134217728",
      max_bytes_before_external_sort: "0",
      max_execution_time: 30,
      optimize_on_insert: 0,
    } as const;

    beforeAll(async () => {
      // Private tables avoid changing merge state or deleting another test's data.
      // The scratch schema has the M2 sorting/partition/replacement keys.
      for (const [table, source, engine] of [
        [
          tables.scratch,
          "observations",
          "ENGINE = ReplacingMergeTree(event_ts, is_deleted) PARTITION BY toYYYYMM(start_time) PRIMARY KEY (project_id, trace_id) ORDER BY (project_id, trace_id, id)",
        ],
        [
          tables.traces,
          "traces",
          "ENGINE = ReplacingMergeTree(event_ts, is_deleted)",
        ],
        [
          tables.dris,
          "dataset_run_items_rmt",
          "ENGINE = ReplacingMergeTree(event_ts, is_deleted)",
        ],
        [
          tables.events,
          "events_full",
          "ENGINE = ReplacingMergeTree(event_ts, is_deleted)",
        ],
        [
          tables.baseline,
          "events_full",
          "ENGINE = ReplacingMergeTree(event_ts, is_deleted)",
        ],
      ]) {
        await clickhouseClient().command({
          query: `CREATE TABLE ${table} AS ${source} ${engine}`,
        });
        createdTables.push(table);
        await clickhouseClient().command({
          query: `SYSTEM STOP MERGES ${table}`,
        });
      }

      const observation = (
        id: string,
        traceId = "selected",
        projectId = "project-a",
      ) =>
        createObservation({
          ...dates,
          project_id: projectId,
          trace_id: traceId,
          id,
          start_time: time,
          end_time: null,
          completion_start_time: null,
          name: "synthetic span",
          input: "synthetic",
          output: null,
          parent_observation_id: null,
          version: null,
          internal_model_id: null,
          prompt_id: null,
        });
      await clickhouseClient().insert({
        table: tables.scratch,
        format: "JSONEachRow",
        clickhouse_settings: { optimize_on_insert: 0 },
        values: [
          observation("root"),
          {
            ...observation("child"),
            parent_observation_id: "root",
            version: "span-version",
          },
          {
            ...observation("empty-parent"),
            parent_observation_id: "",
            metadata: { resourceAttributes: "{}" },
          },
          observation("selected"),
          observation("missing", "missing"),
          observation("other-project", "selected", "project-b"),
          observation("excluded", "dataset"),
          observation("not-excluded", "dataset", "project-b"),
          observation("nulls", "nulls"),
          observation("deleted-trace", "deleted-trace"),
          { ...observation("deleted-span"), is_deleted: 1 },
          observation("duplicate-span"),
          {
            ...observation("duplicate-span"),
            event_ts: "2026-01-15 12:00:01.000",
            input: "new synthetic",
          },
          observation("outside-month", "outside-month"),
        ],
      });
      partId = (
        await rows<{ part: string }>(
          `SELECT DISTINCT _part AS part FROM ${tables.scratch}`,
        )
      )[0].part;
      // A separate source part must not expand the eligible trace-key set.
      await clickhouseClient().insert({
        table: tables.scratch,
        format: "JSONEachRow",
        values: [observation("other-part", "unrelated-0")],
      });
      const trace = (id: string, projectId = "project-a") =>
        createTrace({
          ...dates,
          id,
          project_id: projectId,
          timestamp: time,
          name: "old",
          version: "old",
          release: "release",
          tags: ["synthetic"],
          user_id: "user",
          session_id: null,
          public: true,
          bookmarked: true,
        });
      await clickhouseClient().insert({
        table: tables.traces,
        format: "JSONEachRow",
        clickhouse_settings: { optimize_on_insert: 0 },
        values: [
          trace("selected"),
          {
            ...trace("selected"),
            event_ts: "2026-01-15 12:00:02.000",
            name: "latest",
            version: "latest",
          },
          {
            ...trace("selected", "project-b"),
            name: "other project",
            bookmarked: false,
          },
          trace("dataset"),
          trace("dataset", "project-b"),
          {
            ...trace("nulls"),
            name: null,
            version: null,
            release: null,
            user_id: null,
            tags: [],
          },
          { ...trace("deleted-trace"), is_deleted: 1 },
          { ...trace("outside-month"), timestamp: "2025-12-31 23:59:59.000" },
        ],
      });
      await clickhouseClient().insert({
        table: tables.dris,
        format: "JSONEachRow",
        values: [
          createDatasetRunItem({
            ...dates,
            dataset_run_created_at: time,
            project_id: "project-a",
            trace_id: "dataset",
          }),
        ],
      });
      for (let offset = 0; offset < unrelatedTraceCount; offset += 256) {
        await clickhouseClient().insert({
          table: tables.traces,
          format: "JSONEachRow",
          values: Array.from({ length: 256 }, (_, index) => ({
            ...trace(`unrelated-${offset + index}`),
            name: `${offset + index}-${"x".repeat(16384)}`,
          })),
        });
      }
      expect(
        await rows(
          `SELECT count() AS n FROM ${tables.traces} WHERE project_id = 'project-a' AND id = 'selected'`,
        ),
      ).toEqual([{ n: 2 }]);
    }, 60_000);

    afterAll(async () => {
      for (const table of createdTables.reverse()) {
        await clickhouseClient().command({ query: `DROP TABLE ${table} SYNC` });
      }
    }, 60_000);

    if (unrelatedTraceCount === 4096) {
      it("backfills a small part within 128 MiB despite unrelated wide traces", async () => {
        await clickhouseClient().command({
          query: `TRUNCATE TABLE ${tables.events}`,
        });
        const baseline = baselineQuery();
        await expect(
          clickhouseClient().command({
            query: baseline.query,
            query_params: baseline.params,
            clickhouse_settings: settings,
          }),
        ).rejects.toMatchObject({
          code: "241",
          message: expect.stringContaining("Query memory limit exceeded"),
        });
        const { query, params } = chunkQuery();
        await clickhouseClient().command({
          query,
          query_params: params,
          clickhouse_settings: settings,
        });
        const result = await rows<{ span_id: string; trace_name: string }>(
          `SELECT span_id, trace_name FROM ${tables.events} WHERE span_id = 'root'`,
        );
        expect(result).toEqual([{ span_id: "root", trace_name: "latest" }]);
      }, 60_000);
    }

    it.each([0, 1])(
      "preserves event fields and versions with optimize_on_insert=%i",
      async (optimizeOnInsert) => {
        // Each comparison starts with empty destinations, independently of test order.
        for (const table of [tables.events, tables.baseline]) {
          await clickhouseClient().command({
            query: `TRUNCATE TABLE ${table}`,
          });
        }
        for (const build of [chunkQuery, baselineQuery]) {
          const { query, params } = build();
          await clickhouseClient().command({
            query,
            query_params: params,
            clickhouse_settings: {
              ...settings,
              max_memory_usage: "536870912",
              optimize_on_insert: optimizeOnInsert,
            },
          });
        }
        for (const final of ["", "FINAL"]) {
          const read = (table: string) =>
            rows(
              `SELECT * FROM ${table} ${final} ORDER BY project_id, span_id, event_ts`,
            );
          expect(await read(tables.events)).toEqual(
            await read(tables.baseline),
          );
        }
        const actual = await rows<{
          span_id: string;
          trace_name: string;
          bookmarked: boolean;
          version: string | null;
          source: string;
        }>(
          `SELECT span_id, trace_name, bookmarked, version, source FROM ${tables.events}`,
        );
        expect(actual.find((r) => r.span_id === "root")).toMatchObject({
          trace_name: "latest",
          bookmarked: true,
          version: "latest",
        });
        expect(actual.find((r) => r.span_id === "child")).toMatchObject({
          bookmarked: false,
          version: "span-version",
        });
        expect(actual.find((r) => r.span_id === "empty-parent")).toMatchObject({
          bookmarked: true,
          source: "otel-backfill",
        });
        expect(actual.find((r) => r.span_id === "other-project")).toMatchObject(
          {
            trace_name: "other project",
            bookmarked: false,
          },
        );
        for (const id of ["missing", "nulls", "outside-month"]) {
          expect(actual.find((r) => r.span_id === id)).toMatchObject({
            trace_name: "",
          });
        }
        expect(actual.find((r) => r.span_id === "not-excluded")).toBeDefined();
        expect(actual.find((r) => r.span_id === "excluded")).toBeUndefined();
        expect(actual.find((r) => r.span_id === "other-part")).toBeUndefined();
        expect(
          actual.filter((r) => r.span_id === "duplicate-span"),
        ).toHaveLength(optimizeOnInsert === 0 ? 2 : 1);
        expect(
          await rows(
            `SELECT input FROM ${tables.events} WHERE span_id = 'duplicate-span' ORDER BY event_ts`,
          ),
        ).toEqual(
          optimizeOnInsert === 0
            ? [{ input: "synthetic" }, { input: "new synthetic" }]
            : [{ input: "new synthetic" }],
        );
        expect(
          await rows(
            `SELECT input FROM ${tables.events} FINAL WHERE span_id = 'duplicate-span'`,
          ),
        ).toEqual([{ input: "new synthetic" }]);
        expect(actual.find((r) => r.span_id === "deleted-trace")).toMatchObject(
          {
            trace_name: "old",
          },
        );
        expect(
          await rows(
            `SELECT parent_span_id FROM ${tables.events} WHERE span_id = 'selected'`,
          ),
        ).toEqual([{ parent_span_id: "" }]);
        expect(
          await rows(
            `SELECT parent_span_id FROM ${tables.events} WHERE span_id = 'root'`,
          ),
        ).toEqual([{ parent_span_id: "t-selected" }]);
      },
      60_000,
    );

    it.each([
      { limit: "rows", max_rows_in_set: "1", max_bytes_in_set: "0" },
      { limit: "bytes", max_rows_in_set: "0", max_bytes_in_set: "1" },
    ])(
      "fails closed on a trace-key set $limit limit, even with a break profile",
      async ({ limit, ...setLimits }) => {
        const chunk = chunkQuery();
        // An empty exclusion relation isolates the new trace-key set from the
        // existing dataset-run set: the latter cannot trigger either limit.
        const query = chunk.query.replace(
          `FROM ${tables.dris}`,
          `FROM ${tables.dris} WHERE 0`,
        );
        const limitedSettings = {
          ...settings,
          ...setLimits,
          set_overflow_mode: "break" as const,
        };
        await clickhouseClient().command({
          query: `TRUNCATE TABLE ${tables.events}`,
        });

        // Without the query-scoped guard, overflow can succeed with trace
        // properties missing. This is a correctness check, not a memory benchmark.
        await clickhouseClient().command({
          query: query.replace("set_overflow_mode = 'throw',", ""),
          query_params: chunk.params,
          clickhouse_settings: limitedSettings,
        });
        expect(
          await rows(
            `SELECT trace_name FROM ${tables.events} WHERE span_id = 'root'`,
          ),
        ).toEqual([{ trace_name: "" }]);
        await clickhouseClient().command({
          query: `TRUNCATE TABLE ${tables.events}`,
        });

        await expect(
          clickhouseClient().command({
            query,
            query_params: chunk.params,
            clickhouse_settings: limitedSettings,
          }),
        ).rejects.toMatchObject({
          code: "191",
          message: expect.stringContaining(
            `Limit for IN-set exceeded, max ${limit}:`,
          ),
        });
        expect(await rows(`SELECT count() AS n FROM ${tables.events}`)).toEqual(
          [{ n: 0 }],
        );
      },
    );

    it.skipIf(!profileEnabled)(
      "profiles both INSERT shapes (diagnostic only)",
      async () => {
        for (const [label, build] of [
          ["baseline", baselineQuery],
          ["filtered", chunkQuery],
        ] as const) {
          const { query, params } = build();
          const select = query.slice(query.indexOf("      SELECT"));
          const plan = await clickhouseClient().query({
            query: `EXPLAIN PLAN indexes = 1 ${select}`,
            query_params: params,
            format: "TabSeparated",
          });
          console.info(unrelatedTraceCount, label, await plan.text());
          const queryIds: string[] = [];
          for (let i = 0; i < 3; i++) {
            const queryId = `backfill-profile-${randomUUID()}`;
            queryIds.push(queryId);
            await clickhouseClient().command({
              query,
              query_params: params,
              query_id: queryId,
              clickhouse_settings: {
                ...settings,
                max_memory_usage: "536870912",
                log_queries: 1,
              },
            });
          }
          await clickhouseClient().command({ query: "SYSTEM FLUSH LOGS" });
          const measurements = await rows<{
            memory_usage: number;
            read_rows: number;
          }>(
            `SELECT version() AS version, memory_usage, read_rows, written_rows, query_duration_ms
        FROM system.query_log WHERE query_id IN {queryIds: Array(String)} AND type = 'QueryFinish'
        ORDER BY event_time_microseconds`,
            { queryIds },
          );
          console.info(
            unrelatedTraceCount,
            label,
            JSON.stringify(measurements),
          );
          expect(measurements).toHaveLength(3);
        }
      },
      60_000,
    );
  },
);
