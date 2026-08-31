import { randomUUID } from "node:crypto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type TestContext,
  vi,
} from "vitest";
import {
  createDatasetRunItem,
  createDatasetRunItemsCh,
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  queryClickhouse,
  redis,
  stampExperimentAttributesOnTraceEvents,
} from "@langfuse/shared/src/server";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    stampExperimentAttributesOnTraceEvents: vi.fn((input) =>
      actual.stampExperimentAttributesOnTraceEvents(input),
    ),
  };
});
import {
  EXPERIMENT_CATCH_UP_CURSOR_KEY,
  getUnenrichedDatasetRunItemsBeforeCursor,
  stampUnenrichedDatasetRunItemsBeforeCursor,
} from "../features/eventPropagation/handleExperimentBackfill";
import { skipUnlessClickhouseTablesExist } from "./helpers/clickhouseTables";

describe("experiment backfill catch-up", () => {
  beforeEach(async () => {
    if (!redis) throw new Error("Redis not initialized");
    await redis.del(EXPERIMENT_CATCH_UP_CURSOR_KEY);
  });

  afterEach(async () => {
    await redis?.del(EXPERIMENT_CATCH_UP_CURSOR_KEY);
  });

  it("advances past unstampable rows so later experiments are still enriched", async (ctx: TestContext) => {
    await skipUnlessClickhouseTablesExist(ctx, [
      "events_full",
      "events_core",
      "dataset_run_items_rmt",
    ]);

    const { projectId } = await createOrgProjectAndApiKey();
    const lastRun = new Date();
    // Sit just after the 90-day lookback so these rows are the oldest in the
    // catch-up window and win ORDER BY created_at ASC against leftover test data.
    const lookbackStartMs = lastRun.getTime() - 90 * 24 * 60 * 60 * 1000;
    const poisonCreatedAt = lookbackStartMs + 60_000;
    const goodCreatedAt = poisonCreatedAt + 60_000;

    const poisonTraceId = randomUUID();
    const poisonPresentSpanId = randomUUID();
    const missingObservationId = randomUUID();
    const goodTraceId = randomUUID();
    const goodSpanId = randomUUID();
    const poisonDriId = randomUUID();
    const goodDriId = randomUUID();
    const goodExperimentId = randomUUID();
    const startTimeMs = Date.now();

    await createEventsCh([
      createEvent({
        id: poisonPresentSpanId,
        span_id: poisonPresentSpanId,
        trace_id: poisonTraceId,
        project_id: projectId,
        name: "unrelated-span",
        type: "SPAN",
        start_time: startTimeMs * 1000,
        end_time: (startTimeMs + 10) * 1000,
      }),
      createEvent({
        id: goodSpanId,
        span_id: goodSpanId,
        trace_id: goodTraceId,
        project_id: projectId,
        name: "good-item",
        type: "GENERATION",
        start_time: startTimeMs * 1000,
        end_time: (startTimeMs + 20) * 1000,
      }),
    ]);

    await createDatasetRunItemsCh([
      createDatasetRunItem({
        id: poisonDriId,
        project_id: projectId,
        trace_id: poisonTraceId,
        observation_id: missingObservationId,
        dataset_run_id: randomUUID(),
        dataset_item_id: randomUUID(),
        created_at: poisonCreatedAt,
      }),
      createDatasetRunItem({
        id: goodDriId,
        project_id: projectId,
        trace_id: goodTraceId,
        observation_id: goodSpanId,
        dataset_run_id: goodExperimentId,
        dataset_item_id: randomUUID(),
        created_at: goodCreatedAt,
      }),
    ]);

    const before = await getUnenrichedDatasetRunItemsBeforeCursor(lastRun, 10);
    expect(before.map((row) => row.id)).toEqual(
      expect.arrayContaining([poisonDriId, goodDriId]),
    );
    expect(before.find((row) => row.id === goodDriId)).toMatchObject({
      project_id: projectId,
      trace_id: goodTraceId,
      observation_id: goodSpanId,
    });
    expect(
      before.find((row) => row.id === poisonDriId)?.created_at,
    ).toBeTruthy();

    await stampUnenrichedDatasetRunItemsBeforeCursor(lastRun);

    const remaining = await getUnenrichedDatasetRunItemsBeforeCursor(
      lastRun,
      10,
    );
    expect(remaining.map((row) => row.id)).not.toContain(poisonDriId);

    const rows = await queryClickhouse<{
      span_id: string;
      experiment_id: string;
    }>({
      query: `
        SELECT span_id, experiment_id
        FROM events_full
        WHERE project_id = {projectId: String}
          AND span_id = {spanId: String}
          AND is_deleted = 0
        ORDER BY event_ts DESC
        LIMIT 1
      `,
      params: { projectId, spanId: goodSpanId },
    });
    expect(rows[0]?.experiment_id).toBe(goodExperimentId);
  });

  it("does not advance the catch-up cursor past a dataset run item whose stamp throws", async (ctx: TestContext) => {
    await skipUnlessClickhouseTablesExist(ctx, [
      "events_full",
      "events_core",
      "dataset_run_items_rmt",
    ]);

    const { projectId } = await createOrgProjectAndApiKey();
    const lastRun = new Date();
    const lookbackStartMs = lastRun.getTime() - 90 * 24 * 60 * 60 * 1000;
    const throwCreatedAt = lookbackStartMs + 60_000;
    const laterCreatedAt = throwCreatedAt + 60_000;

    const throwTraceId = randomUUID();
    const throwSpanId = randomUUID();
    const laterTraceId = randomUUID();
    const laterSpanId = randomUUID();
    const throwDriId = randomUUID();
    const laterDriId = randomUUID();
    const throwExperimentId = randomUUID();
    const laterExperimentId = randomUUID();
    const startTimeMs = Date.now();

    vi.mocked(stampExperimentAttributesOnTraceEvents).mockImplementation(
      async (input) => {
        if (input.experimentId === throwExperimentId) {
          throw new Error("simulated clickhouse failure");
        }
        const { stampExperimentAttributesOnTraceEvents: actualStamp } =
          await vi.importActual<typeof import("@langfuse/shared/src/server")>(
            "@langfuse/shared/src/server",
          );
        return actualStamp(input);
      },
    );

    try {
      await createEventsCh([
        createEvent({
          id: throwSpanId,
          span_id: throwSpanId,
          trace_id: throwTraceId,
          project_id: projectId,
          name: "throw-item",
          type: "GENERATION",
          start_time: startTimeMs * 1000,
          end_time: (startTimeMs + 10) * 1000,
        }),
        createEvent({
          id: laterSpanId,
          span_id: laterSpanId,
          trace_id: laterTraceId,
          project_id: projectId,
          name: "later-item",
          type: "GENERATION",
          start_time: startTimeMs * 1000,
          end_time: (startTimeMs + 20) * 1000,
        }),
      ]);

      await createDatasetRunItemsCh([
        createDatasetRunItem({
          id: throwDriId,
          project_id: projectId,
          trace_id: throwTraceId,
          observation_id: throwSpanId,
          dataset_run_id: throwExperimentId,
          dataset_item_id: randomUUID(),
          created_at: throwCreatedAt,
        }),
        createDatasetRunItem({
          id: laterDriId,
          project_id: projectId,
          trace_id: laterTraceId,
          observation_id: laterSpanId,
          dataset_run_id: laterExperimentId,
          dataset_item_id: randomUUID(),
          created_at: laterCreatedAt,
        }),
      ]);

      await stampUnenrichedDatasetRunItemsBeforeCursor(lastRun);

      const remaining = await getUnenrichedDatasetRunItemsBeforeCursor(
        lastRun,
        10,
      );
      expect(remaining.map((row) => row.id)).toContain(throwDriId);
    } finally {
      vi.mocked(stampExperimentAttributesOnTraceEvents).mockImplementation(
        async (input) => {
          const { stampExperimentAttributesOnTraceEvents: actualStamp } =
            await vi.importActual<typeof import("@langfuse/shared/src/server")>(
              "@langfuse/shared/src/server",
            );
          return actualStamp(input);
        },
      );
    }
  });
});
