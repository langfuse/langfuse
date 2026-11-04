import { randomUUID } from "node:crypto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type TestContext,
} from "vitest";
import waitForExpect from "wait-for-expect";
import {
  clickhouseClient,
  createObservation,
  createDatasetRunItem,
  createDatasetRunItemsCh,
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  queryClickhouse,
  redis,
  toClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { handleEventPropagationJob } from "../features/eventPropagation/handleEventPropagationJob";
import { runExperimentBackfill } from "../features/eventPropagation/handleExperimentBackfill";
import { ClickhouseWriter, TableName } from "../services/ClickhouseWriter";
import { skipUnlessClickhouseTablesExist } from "./helpers/clickhouseTables";

const LAST_PROCESSED_PARTITION_KEY =
  "langfuse:event-propagation:last-processed-partition";

let previousLastProcessedPartition: string | null = null;

async function skipUnlessEventPropagationTablesExist(
  ctx: TestContext,
): Promise<void> {
  await skipUnlessClickhouseTablesExist(
    ctx,
    [TableName.ObservationsBatchStaging, TableName.EventsFull],
    "event propagation ClickHouse tables are not enabled",
  );
}

function formatClickHouseDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

describe("handleEventPropagationJob", () => {
  beforeEach(async () => {
    if (!redis) throw new Error("Redis not initialized");

    previousLastProcessedPartition = await redis.get(
      LAST_PROCESSED_PARTITION_KEY,
    );
    await redis.del(LAST_PROCESSED_PARTITION_KEY);
  });

  afterEach(async () => {
    if (!redis) return;

    if (previousLastProcessedPartition === null) {
      await redis.del(LAST_PROCESSED_PARTITION_KEY);
    } else {
      await redis.set(
        LAST_PROCESSED_PARTITION_KEY,
        previousLastProcessedPartition,
      );
    }
  });

  it("computes event size for live experiment propagation", async (ctx) => {
    await skipUnlessEventPropagationTablesExist(ctx);
    const projectId = randomUUID();
    const traceId = randomUUID();
    const cursorKey = "langfuse:event-propagation:experiment-backfill:last-run";
    const lockKey = "langfuse:experiment-backfill:lock";
    const createdAt = Date.now() - 120_000;
    const get = redis!.get.bind(redis!);
    const set = redis!.set.bind(redis!);
    const getSpy = vi
      .spyOn(redis!, "get")
      .mockImplementation((...args) =>
        args[0] === cursorKey
          ? Promise.resolve(new Date(createdAt - 600_000).toISOString())
          : get(...args),
      );
    const setSpy = vi.spyOn(redis!, "set").mockImplementation((...args) => {
      if (args[0] === cursorKey) {
        return Promise.resolve(args.some((arg) => arg === "NX") ? null : "OK");
      }
      return args[0] === lockKey ? Promise.resolve("OK") : set(...args);
    });
    try {
      await createTracesCh([
        createTrace({
          project_id: projectId,
          id: traceId,
          timestamp: createdAt,
          input: "experiment input 🔥",
          created_at: createdAt,
        }),
      ]);
      await createDatasetRunItemsCh([
        createDatasetRunItem({
          project_id: projectId,
          trace_id: traceId,
          created_at: createdAt,
        }),
      ]);
      await runExperimentBackfill();
      await ClickhouseWriter.shutdownAll();
      const rows = await queryClickhouse<{
        bytes: string;
        experiment_id: string;
      }>({
        query: `SELECT toString(event_bytes) AS bytes, experiment_id FROM events_full
          WHERE project_id = {projectId: String} AND trace_id = {traceId: String}`,
        params: { projectId, traceId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].experiment_id).not.toBe("");
      expect(Number(rows[0].bytes)).toBeGreaterThan(0);
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
      await ClickhouseWriter.shutdownAll();
    }
  }, 15_000);

  it("propagates observation staging rows into events_full", async (ctx) => {
    await skipUnlessEventPropagationTablesExist(ctx);

    const { projectId } = await createOrgProjectAndApiKey();
    const traceId = randomUUID();
    const observationId = randomUUID();
    const oldEnoughForPropagation = Date.now() - 20 * 60 * 1000;

    await createTracesCh([
      createTrace({
        id: traceId,
        project_id: projectId,
        name: "propagation-trace",
        user_id: "propagation-user",
        session_id: "propagation-session",
        timestamp: oldEnoughForPropagation,
        created_at: oldEnoughForPropagation,
        updated_at: oldEnoughForPropagation,
        event_ts: oldEnoughForPropagation,
      }),
    ]);

    await clickhouseClient().insert({
      table: TableName.ObservationsBatchStaging,
      format: "JSONEachRow",
      values: [
        {
          ...createObservation({
            id: observationId,
            trace_id: traceId,
            project_id: projectId,
            type: "GENERATION",
            environment: "default",
            name: "propagated-observation",
            parent_observation_id: null,
            start_time: oldEnoughForPropagation,
            end_time: oldEnoughForPropagation + 1_000,
            created_at: oldEnoughForPropagation,
            updated_at: oldEnoughForPropagation,
            event_ts: oldEnoughForPropagation,
          }),
          ingestion_api_key: "pk-lf-propagation-test",
          ingestion_sdk_name: "langfuse-js",
          ingestion_sdk_version: "4.2.0",
          s3_first_seen_timestamp: toClickhouseDateTime(
            oldEnoughForPropagation,
          ),
        },
      ],
    });

    const partitionRows = await queryClickhouse<{ partition: string }>({
      query: `
        SELECT toString(tupleElement(_partition_value, 1)) AS partition
        FROM observations_batch_staging
        WHERE project_id = {projectId: String}
          AND trace_id = {traceId: String}
          AND id = {observationId: String}
        LIMIT 1
      `,
      params: {
        projectId,
        traceId,
        observationId,
      },
    });
    expect(partitionRows[0]?.partition).toBeDefined();

    const partitionCursor = formatClickHouseDateTime(
      new Date(
        new Date(
          `${partitionRows[0]!.partition.replace(" ", "T")}Z`,
        ).getTime() - 1_000,
      ),
    );
    await redis!.set(LAST_PROCESSED_PARTITION_KEY, partitionCursor);

    await handleEventPropagationJob({
      data: { id: "event-propagation-job-test" },
    } as Parameters<typeof handleEventPropagationJob>[0]);

    await waitForExpect(async () => {
      const rows = await queryClickhouse<{
        trace_id: string;
        span_id: string;
        parent_span_id: string;
        name: string;
        type: string;
        environment: string;
        ingestion_api_key: string;
        ingestion_sdk_name: string;
        ingestion_sdk_version: string;
        trace_name: string;
        user_id: string;
        session_id: string;
        source: string;
        event_bytes: string;
      }>({
        query: `
          SELECT
            trace_id,
            span_id,
            parent_span_id,
            name,
            type,
            environment,
            ingestion_api_key,
            ingestion_sdk_name,
            ingestion_sdk_version,
            trace_name,
            user_id,
            session_id,
            source,
            toString(event_bytes) AS event_bytes
          FROM events_full FINAL
          WHERE project_id = {projectId: String}
            AND trace_id = {traceId: String}
            AND span_id = {observationId: String}
          LIMIT 1
        `,
        params: {
          projectId,
          traceId,
          observationId,
        },
      });

      expect(rows).toEqual([
        {
          trace_id: traceId,
          span_id: observationId,
          parent_span_id: `t-${traceId}`,
          name: "propagated-observation",
          type: "GENERATION",
          environment: "default",
          ingestion_api_key: "pk-lf-propagation-test",
          ingestion_sdk_name: "langfuse-js",
          ingestion_sdk_version: "4.2.0",
          trace_name: "propagation-trace",
          user_id: "propagation-user",
          session_id: "propagation-session",
          source: "ingestion-api-dual-write",
          event_bytes: expect.stringMatching(/^[1-9]\d*$/),
        },
      ]);
    }, 5_000);
  }, 15_000);
});
