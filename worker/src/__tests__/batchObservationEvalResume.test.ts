import { describe, expect, it, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { Decimal } from "decimal.js";
import {
  ActionId,
  BatchActionStatus,
  EvalTargetObject,
  EvalTemplateType,
  JobConfigState,
  type EventsStreamCursor,
} from "@langfuse/shared";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  getEventsStreamForEval,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { processBatchedObservationEval } from "../features/batchAction/processBatchedObservationEval";
import type { ObservationEvalRule } from "../features/evaluation/observationEval/types";

const enqueueEvalJob = vi.hoisted(() => vi.fn());

vi.mock(
  "../features/evaluation/observationEval/createSchedulerDeps",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../features/evaluation/observationEval/createSchedulerDeps")
      >();
    return {
      createObservationEvalSchedulerDeps: () => ({
        ...actual.createObservationEvalSchedulerDeps(),
        enqueueEvalJob,
      }),
    };
  },
);

const maybeDescribe =
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

maybeDescribe("batch observation eval resume", () => {
  beforeEach(() => {
    enqueueEvalJob.mockReset();
  });

  it("pages through the events and resumes behind the stored cursor", async () => {
    const { projectId, eventIds } = await setupEvents();
    const allRows = await collectRows(
      await getEventsStreamForEval({
        projectId,
        cutoffCreatedAt: new Date(Date.now() + 60_000),
        filter: [],
        rowLimit: 100,
        pageSize: 2,
      }),
    );

    expect(allRows.map((row) => row.id)).toEqual(eventIds);

    const batchActionId = await createBatchAction(projectId, {
      cursor: allRows[1].cursor,
      totalCount: 2,
      processedCount: 2,
      failedCount: 0,
    });

    await runBatch(projectId, batchActionId, createEvaluators(projectId));

    expect(await enqueuedObservationIds()).toEqual(
      eventIds.slice(2).toSorted(),
    );
    const batchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchActionId },
    });
    expect(batchAction).toMatchObject({
      status: BatchActionStatus.Completed,
      totalCount: 5,
      processedCount: 5,
      failedCount: 0,
      cursor: allRows[4].cursor,
    });
  });

  it("emits a span stored with several start times once across pages", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTime = minuteAgoPlusMicros();
    const spanId = randomUUID();
    const otherSpanId = randomUUID();
    await createEventsCh([
      ...[2, 1].map((offset) =>
        createEvent({
          id: spanId,
          span_id: spanId,
          project_id: projectId,
          trace_id: randomUUID(),
          start_time: startTime(offset),
        }),
      ),
      createEvent({
        id: otherSpanId,
        span_id: otherSpanId,
        project_id: projectId,
        trace_id: randomUUID(),
        start_time: startTime(0),
      }),
    ]);

    const rows = await collectRows(
      await getEventsStreamForEval({
        projectId,
        cutoffCreatedAt: new Date(Date.now() + 60_000),
        filter: [],
        rowLimit: 2,
        pageSize: 1,
      }),
    );

    expect(rows.map((row) => row.id)).toEqual([spanId, otherSpanId]);
  });
});

/**
 * Creates five events and returns their ids in stream order. Start times
 * differ by single microseconds and two rows tie, so a cursor that loses
 * precision or ignores the span id tiebreak would skip or repeat rows.
 */
async function setupEvents() {
  const { projectId } = await createOrgProjectAndApiKey();
  const startTime = minuteAgoPlusMicros();
  const events = [0, 1, 2, 3, 3].map((offset) => {
    const id = randomUUID();
    return createEvent({
      id,
      span_id: id,
      project_id: projectId,
      trace_id: randomUUID(),
      start_time: startTime(offset),
    });
  });
  await createEventsCh(events);

  const eventIds = events
    .toSorted(
      (a, b) =>
        compareStrings(b.start_time, a.start_time) ||
        compareStrings(b.span_id, a.span_id),
    )
    .map((event) => event.span_id);

  return { projectId, eventIds };
}

async function createBatchAction(
  projectId: string,
  checkpoint: {
    cursor?: EventsStreamCursor;
    totalCount?: number;
    processedCount?: number;
    failedCount?: number;
  },
) {
  const batchAction = await prisma.batchAction.create({
    data: {
      projectId,
      userId: "user-1",
      actionType: ActionId.ObservationBatchEvaluation,
      tableName: "observations",
      status: BatchActionStatus.Processing,
      query: { filter: [], orderBy: null },
      ...checkpoint,
    },
  });
  return batchAction.id;
}

function createEvaluators(projectId: string): ObservationEvalRule[] {
  return [
    {
      id: `config-${randomUUID()}`,
      projectId,
      filter: [],
      sampling: new Decimal(1),
      evalTemplateId: `template-${randomUUID()}`,
      evalTemplate: { type: EvalTemplateType.LLM_AS_JUDGE },
      scoreName: "quality",
      targetObject: EvalTargetObject.EVENT,
      variableMapping: [],
      status: JobConfigState.ACTIVE,
      blockedAt: null,
    },
  ];
}

async function runBatch(
  projectId: string,
  batchActionId: string,
  evaluators: ObservationEvalRule[],
) {
  await processBatchedObservationEval({
    projectId,
    batchActionId,
    evaluators,
    rowLimit: 100,
    openObservationStream: (resume) =>
      getEventsStreamForEval({
        projectId,
        cutoffCreatedAt: new Date(Date.now() + 60_000),
        filter: [],
        pageSize: 2,
        ...resume,
      }),
  });
}

/** Observation ids of the enqueued eval jobs, sorted; enqueue order is concurrent. */
async function enqueuedObservationIds() {
  const jobExecutionIds = enqueueEvalJob.mock.calls.map(
    ([params]) => params.jobExecutionId as string,
  );
  const jobExecutions = await prisma.jobExecution.findMany({
    where: { id: { in: jobExecutionIds } },
  });
  expect(jobExecutions).toHaveLength(jobExecutionIds.length);
  return jobExecutions
    .map((execution) => execution.jobInputObservationId)
    .toSorted();
}

/**
 * Returns ClickHouse DateTime64(6) strings a minute in the past, `micros`
 * (0-9) apart. Numeric inputs to `createEvent` are truncated to milliseconds.
 */
function minuteAgoPlusMicros() {
  const millis = new Date(Date.now() - 60_000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");
  return (micros: number) => `${millis}00${micros}`;
}

// ClickHouse orders strings by bytes, not by locale.
function compareStrings(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

async function collectRows(stream: AsyncIterable<unknown>) {
  const rows: Array<{ id: string; cursor: EventsStreamCursor }> = [];
  for await (const row of stream) {
    rows.push(row as { id: string; cursor: EventsStreamCursor });
  }
  return rows;
}
