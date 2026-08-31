import { randomUUID } from "crypto";
import waitForExpect from "wait-for-expect";
import { describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  ActionId,
  BatchActionStatus,
  BatchExportTableName,
  createTraceDeleteBatchActionConfig,
  TraceDeleteBatchActionConfigSchema,
  type FilterState,
} from "@langfuse/shared";
import {
  createEvent,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  deleteObservationsByTraceIds,
  deleteScoresByTraceIds,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { processTraceDeleteBatchAction } from "../features/batchAction/processTraceDeleteBatchAction";
import { TraceDeleteBatchActionRunner } from "../features/trace-delete-batch-action-runner";
import { skipUnlessClickhouseTablesExist } from "./helpers/clickhouseTables";

type ClickHouseTable =
  | "traces"
  | "observations"
  | "scores"
  | "events_full"
  | "events_core";

const countByTraceIds = async (
  table: ClickHouseTable,
  projectId: string,
  traceIds: string[],
) => {
  const idColumn = table === "traces" ? "id" : "trace_id";
  const rows = await queryClickhouse<{ count: string }>({
    query: `
      SELECT count(*) as count
      FROM ${table}
      WHERE project_id = {projectId: String}
        AND ${idColumn} IN ({traceIds: Array(String)})
    `,
    params: { projectId, traceIds },
    tags: { projectId },
  });

  return Number(rows[0]?.count ?? 0);
};

const expectCountsEventually = async (
  projectId: string,
  traceIds: string[],
  expected: Partial<Record<ClickHouseTable, number>>,
) => {
  await waitForExpect(async () => {
    await Promise.all(
      Object.entries(expected).map(async ([table, count]) => {
        await expect(
          countByTraceIds(table as ClickHouseTable, projectId, traceIds),
        ).resolves.toBe(count);
      }),
    );
  }, 20_000);
};

const traceDeleteQuery = (userId: string, extraFilters: FilterState = []) => ({
  filter: [
    {
      column: "userId",
      operator: "=" as const,
      value: userId,
      type: "string" as const,
    },
    ...extraFilters,
  ],
  orderBy: { column: "timestamp", order: "DESC" as const },
});

const createTraceDeleteBatchAction = async (opts: {
  projectId: string;
  userId: string;
  useEventsTable: boolean;
  cutoffCreatedAt: Date;
  query: ReturnType<typeof traceDeleteQuery>;
}) => {
  return prisma.batchAction.create({
    data: {
      id: randomUUID(),
      projectId: opts.projectId,
      userId: opts.userId,
      actionType: ActionId.TraceDelete,
      tableName: BatchExportTableName.Traces,
      status: BatchActionStatus.Queued,
      query: {
        ...opts.query,
        useEventsTable: opts.useEventsTable,
      },
      config: createTraceDeleteBatchActionConfig({
        useEventsTable: opts.useEventsTable,
        cutoffCreatedAt: opts.cutoffCreatedAt,
      }),
      totalCount: null,
      processedCount: 0,
      failedCount: 0,
    },
  });
};

const createLegacyArtifacts = async (opts: {
  projectId: string;
  traceIds: string[];
  userId: string;
  timestamp: Date;
}) => {
  await createTracesCh(
    opts.traceIds.map((traceId, index) =>
      createTrace({
        id: traceId,
        project_id: opts.projectId,
        user_id: opts.userId,
        timestamp: opts.timestamp.getTime() + index,
        created_at: opts.timestamp.getTime() + index,
        event_ts: opts.timestamp.getTime() + index,
      }),
    ),
  );
  await createObservationsCh(
    opts.traceIds.map((traceId, index) =>
      createObservation({
        id: randomUUID(),
        trace_id: traceId,
        project_id: opts.projectId,
        start_time: opts.timestamp.getTime() + index,
        created_at: opts.timestamp.getTime() + index,
        event_ts: opts.timestamp.getTime() + index,
      }),
    ),
  );
  await createScoresCh(
    opts.traceIds.map((traceId, index) =>
      createTraceScore({
        id: randomUUID(),
        trace_id: traceId,
        project_id: opts.projectId,
        timestamp: opts.timestamp.getTime() + index,
        created_at: opts.timestamp.getTime() + index,
        event_ts: opts.timestamp.getTime() + index,
      }),
    ),
  );
};

const createEventArtifacts = async (opts: {
  projectId: string;
  traceIds: string[];
  userId: string;
  timestamp: Date;
  parentSpanId?: string;
}) => {
  await createEventsCh(
    opts.traceIds.map((traceId, index) => {
      const eventTime = (opts.timestamp.getTime() + index) * 1000;
      return createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        parent_span_id: opts.parentSpanId ?? "",
        trace_id: traceId,
        project_id: opts.projectId,
        trace_name: `trace-${traceId}`,
        user_id: opts.userId,
        start_time: eventTime,
        created_at: eventTime,
        updated_at: eventTime,
        event_ts: eventTime,
      });
    }),
  );
  await createScoresCh(
    opts.traceIds.map((traceId, index) =>
      createTraceScore({
        id: randomUUID(),
        trace_id: traceId,
        project_id: opts.projectId,
        timestamp: opts.timestamp.getTime() + index,
        created_at: opts.timestamp.getTime() + index,
        event_ts: opts.timestamp.getTime() + index,
      }),
    ),
  );
};

describe("trace delete batch action worker processor", () => {
  it("deletes only selected legacy traces from a persisted batch action", async () => {
    const { projectId } = await createOrgProjectAndApiKey({ plan: "Team" });
    const otherProject = await createOrgProjectAndApiKey({ plan: "Team" });
    const deleteUserId = `delete-user-${randomUUID()}`;
    const keepUserId = `keep-user-${randomUUID()}`;
    const beforeCutoff = new Date(Date.now() - 60_000);
    const cutoffCreatedAt = new Date();
    const lateTimestamp = new Date(Date.now() + 3_600_000);
    // The oldest selected trace intentionally sorts after the page cursor id.
    // This catches cursor predicates that incorrectly require id < cursorId
    // across older timestamps.
    const selectedTraceIds = [
      `zzzz-${randomUUID()}`,
      `aaaa-${randomUUID()}`,
      `mmmm-${randomUUID()}`,
    ];
    const nonMatchingTraceId = randomUUID();
    const lateTraceId = randomUUID();
    const otherProjectTraceId = randomUUID();

    await createLegacyArtifacts({
      projectId,
      traceIds: selectedTraceIds,
      userId: deleteUserId,
      timestamp: beforeCutoff,
    });
    await createLegacyArtifacts({
      projectId,
      traceIds: [nonMatchingTraceId],
      userId: keepUserId,
      timestamp: beforeCutoff,
    });
    await createLegacyArtifacts({
      projectId: otherProject.projectId,
      traceIds: [otherProjectTraceId],
      userId: deleteUserId,
      timestamp: beforeCutoff,
    });

    const batchAction = await createTraceDeleteBatchAction({
      projectId,
      userId: `user-${randomUUID()}`,
      useEventsTable: false,
      cutoffCreatedAt,
      query: traceDeleteQuery(deleteUserId),
    });

    await createLegacyArtifacts({
      projectId,
      traceIds: [lateTraceId],
      userId: deleteUserId,
      timestamp: lateTimestamp,
    });

    let leaseExtensions = 0;
    await processTraceDeleteBatchAction({
      batchActionId: batchAction.id,
      batchSize: 2,
      extendLease: async () => {
        leaseExtensions += 1;
        return true;
      },
    });
    expect(leaseExtensions).toBe(2);

    await expectCountsEventually(projectId, selectedTraceIds, {
      traces: 0,
      observations: 0,
      scores: 0,
    });
    await expectCountsEventually(projectId, [nonMatchingTraceId, lateTraceId], {
      traces: 2,
      observations: 2,
      scores: 2,
    });
    await expectCountsEventually(
      otherProject.projectId,
      [otherProjectTraceId],
      {
        traces: 1,
        observations: 1,
        scores: 1,
      },
    );

    const updatedBatchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchAction.id },
    });
    expect(updatedBatchAction.status).toBe(BatchActionStatus.Completed);
    expect(updatedBatchAction.processedCount).toBe(3);
    expect(updatedBatchAction.totalCount).toBe(3);
    expect(updatedBatchAction.config).toMatchObject({ inFlightBatch: null });
  });

  it("deletes only selected events-backed traces from a persisted batch action", async (ctx) => {
    await skipUnlessClickhouseTablesExist(
      ctx,
      ["events_full"],
      "events ClickHouse tables are not enabled",
    );

    const { projectId } = await createOrgProjectAndApiKey({ plan: "Team" });
    const otherProject = await createOrgProjectAndApiKey({ plan: "Team" });
    const deleteUserId = `delete-user-${randomUUID()}`;
    const keepUserId = `keep-user-${randomUUID()}`;
    const beforeCutoff = new Date(Date.now() - 60_000);
    const cutoffCreatedAt = new Date();
    const lateTimestamp = new Date(Date.now() + 3_600_000);
    // The oldest selected trace intentionally sorts after the page cursor id.
    // This catches cursor predicates that incorrectly require id < cursorId
    // across older timestamps.
    const selectedTraceIds = [
      `zzzz-${randomUUID()}`,
      `aaaa-${randomUUID()}`,
      `mmmm-${randomUUID()}`,
    ];
    const nonMatchingTraceId = randomUUID();
    const childOnlyTraceId = randomUUID();
    const lateTraceId = randomUUID();
    const otherProjectTraceId = randomUUID();

    await createEventArtifacts({
      projectId,
      traceIds: selectedTraceIds,
      userId: deleteUserId,
      timestamp: beforeCutoff,
    });
    await createEventArtifacts({
      projectId,
      traceIds: [nonMatchingTraceId],
      userId: keepUserId,
      timestamp: beforeCutoff,
    });
    await createEventArtifacts({
      projectId,
      traceIds: [childOnlyTraceId],
      userId: deleteUserId,
      timestamp: beforeCutoff,
      parentSpanId: randomUUID(),
    });
    await createEventArtifacts({
      projectId: otherProject.projectId,
      traceIds: [otherProjectTraceId],
      userId: deleteUserId,
      timestamp: beforeCutoff,
    });

    await expectCountsEventually(projectId, selectedTraceIds, {
      events_core: 3,
      events_full: 3,
      scores: 3,
    });

    const batchAction = await createTraceDeleteBatchAction({
      projectId,
      userId: `user-${randomUUID()}`,
      useEventsTable: true,
      cutoffCreatedAt,
      query: traceDeleteQuery(deleteUserId, [
        {
          column: "isRootObservation",
          operator: "=" as const,
          value: true,
          type: "boolean" as const,
        },
      ]),
    });

    await createEventArtifacts({
      projectId,
      traceIds: [lateTraceId],
      userId: deleteUserId,
      timestamp: lateTimestamp,
    });
    await expectCountsEventually(projectId, [lateTraceId], {
      events_core: 1,
      events_full: 1,
      scores: 1,
    });

    await processTraceDeleteBatchAction({
      batchActionId: batchAction.id,
      batchSize: 2,
    });

    await expectCountsEventually(projectId, selectedTraceIds, {
      events_core: 0,
      events_full: 0,
      scores: 0,
    });
    await expectCountsEventually(
      projectId,
      [nonMatchingTraceId, childOnlyTraceId, lateTraceId],
      {
        events_core: 3,
        events_full: 3,
        scores: 3,
      },
    );
    await expectCountsEventually(
      otherProject.projectId,
      [otherProjectTraceId],
      {
        events_core: 1,
        events_full: 1,
        scores: 1,
      },
    );

    const updatedBatchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchAction.id },
    });
    expect(updatedBatchAction.status).toBe(BatchActionStatus.Completed);
    expect(updatedBatchAction.processedCount).toBe(3);
    expect(updatedBatchAction.totalCount).toBe(3);
    expect(updatedBatchAction.config).toMatchObject({
      source: "events",
      inFlightBatch: null,
    });
  });

  it("retries a persisted in-flight batch idempotently", async () => {
    const { projectId } = await createOrgProjectAndApiKey({ plan: "Team" });
    const deleteUserId = `delete-user-${randomUUID()}`;
    const keepUserId = `keep-user-${randomUUID()}`;
    const beforeCutoff = new Date(Date.now() - 60_000);
    const selectedTraceIds = [randomUUID(), randomUUID()];
    const nonMatchingTraceId = randomUUID();

    await createLegacyArtifacts({
      projectId,
      traceIds: selectedTraceIds,
      userId: deleteUserId,
      timestamp: beforeCutoff,
    });
    await createLegacyArtifacts({
      projectId,
      traceIds: [nonMatchingTraceId],
      userId: keepUserId,
      timestamp: beforeCutoff,
    });

    const batchAction = await createTraceDeleteBatchAction({
      projectId,
      userId: `user-${randomUUID()}`,
      useEventsTable: false,
      cutoffCreatedAt: new Date(),
      query: traceDeleteQuery(deleteUserId),
    });

    await deleteObservationsByTraceIds(projectId, [selectedTraceIds[0]]);
    await deleteScoresByTraceIds(projectId, [selectedTraceIds[0]]);

    await prisma.batchAction.update({
      where: { id: batchAction.id },
      data: {
        status: BatchActionStatus.Processing,
        config: {
          ...createTraceDeleteBatchActionConfig({
            useEventsTable: false,
            cutoffCreatedAt: new Date(),
          }),
          failureCount: 3,
          inFlightBatch: {
            traceIds: selectedTraceIds,
            cursorAfter: {
              timestamp: beforeCutoff.toISOString(),
              traceId: selectedTraceIds[0],
            },
            minTimestamp: beforeCutoff.toISOString(),
            maxTimestamp: beforeCutoff.toISOString(),
          },
        },
      },
    });

    await processTraceDeleteBatchAction({
      batchActionId: batchAction.id,
      batchSize: 2,
    });

    await expectCountsEventually(projectId, selectedTraceIds, {
      traces: 0,
      observations: 0,
      scores: 0,
    });
    await expectCountsEventually(projectId, [nonMatchingTraceId], {
      traces: 1,
      observations: 1,
      scores: 1,
    });

    const updatedBatchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchAction.id },
    });
    expect(updatedBatchAction.status).toBe(BatchActionStatus.Completed);
    expect(updatedBatchAction.processedCount).toBe(2);
    expect(
      TraceDeleteBatchActionConfigSchema.parse(updatedBatchAction.config),
    ).toMatchObject({
      failureCount: 0,
      inFlightBatch: null,
    });
  });

  it("marks guarded trace deletion skips as failed without throwing", async () => {
    const { projectId } = await createOrgProjectAndApiKey({ plan: "Team" });
    const deleteUserId = `delete-user-${randomUUID()}`;
    const beforeCutoff = new Date(Date.now() - 60_000);
    const selectedTraceIds = [randomUUID()];

    await createLegacyArtifacts({
      projectId,
      traceIds: selectedTraceIds,
      userId: deleteUserId,
      timestamp: beforeCutoff,
    });

    const batchAction = await createTraceDeleteBatchAction({
      projectId,
      userId: `user-${randomUUID()}`,
      useEventsTable: false,
      cutoffCreatedAt: new Date(),
      query: traceDeleteQuery(deleteUserId),
    });

    let skippedDeletion:
      | { projectId: string; traceIds: string[]; entityType: string }
      | undefined;

    const result = await processTraceDeleteBatchAction({
      batchActionId: batchAction.id,
      batchSize: 1,
      shouldSkipDeletion: async (seenProjectId, traceIds, entityType) => {
        skippedDeletion = {
          projectId: seenProjectId,
          traceIds,
          entityType,
        };
        return true;
      },
    });

    expect(result).toEqual({
      status: "failed",
      processedBatches: 0,
    });
    expect(skippedDeletion).toEqual({
      projectId,
      traceIds: selectedTraceIds,
      entityType: "trace",
    });
    await expectCountsEventually(projectId, selectedTraceIds, {
      traces: 1,
      observations: 1,
      scores: 1,
    });

    const updatedBatchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchAction.id },
    });
    expect(updatedBatchAction.status).toBe(BatchActionStatus.Failed);
    expect(updatedBatchAction.log).toContain("Trace deletion skipped");
  });

  it("does not commit progress after the runner lease is lost", async () => {
    const { projectId } = await createOrgProjectAndApiKey({ plan: "Team" });
    const deleteUserId = `delete-user-${randomUUID()}`;
    const beforeCutoff = new Date(Date.now() - 60_000);
    const selectedTraceIds = [randomUUID(), randomUUID()];

    await createLegacyArtifacts({
      projectId,
      traceIds: selectedTraceIds,
      userId: deleteUserId,
      timestamp: beforeCutoff,
    });

    const batchAction = await createTraceDeleteBatchAction({
      projectId,
      userId: `user-${randomUUID()}`,
      useEventsTable: false,
      cutoffCreatedAt: new Date(),
      query: traceDeleteQuery(deleteUserId),
    });

    const inFlightBatch = {
      traceIds: selectedTraceIds,
      cursorAfter: {
        timestamp: beforeCutoff.toISOString(),
        traceId: selectedTraceIds[0],
      },
      minTimestamp: beforeCutoff.toISOString(),
      maxTimestamp: beforeCutoff.toISOString(),
    };

    await prisma.batchAction.update({
      where: { id: batchAction.id },
      data: {
        status: BatchActionStatus.Processing,
        config: {
          ...createTraceDeleteBatchActionConfig({
            useEventsTable: false,
            cutoffCreatedAt: new Date(),
          }),
          inFlightBatch,
        },
      },
    });

    await expect(
      processTraceDeleteBatchAction({
        batchActionId: batchAction.id,
        batchSize: 2,
        canCommitProgress: async () => false,
      }),
    ).rejects.toThrow("lost its worker lease");

    const updatedBatchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchAction.id },
    });
    expect(updatedBatchAction.status).toBe(BatchActionStatus.Processing);
    expect(updatedBatchAction.processedCount).toBe(0);
    expect(updatedBatchAction.log).toBeNull();
    expect(
      TraceDeleteBatchActionConfigSchema.parse(updatedBatchAction.config),
    ).toMatchObject({
      failureCount: 0,
      inFlightBatch,
    });
  });

  it("fails a persisted batch action after ten consecutive failures", async () => {
    const { projectId } = await createOrgProjectAndApiKey({ plan: "Team" });
    const batchActionId = randomUUID();

    await prisma.batchAction.create({
      data: {
        id: batchActionId,
        projectId,
        userId: `user-${randomUUID()}`,
        actionType: ActionId.TraceDelete,
        tableName: BatchExportTableName.Traces,
        status: BatchActionStatus.Queued,
        query: {
          filter: [],
          orderBy: { column: "timestamp", order: "NOPE" },
          useEventsTable: false,
        },
        config: createTraceDeleteBatchActionConfig({
          useEventsTable: false,
          cutoffCreatedAt: new Date(),
        }),
        totalCount: null,
        processedCount: 0,
        failedCount: 0,
      },
    });

    for (let i = 0; i < 10; i += 1) {
      await expect(
        processTraceDeleteBatchAction({
          batchActionId,
          batchSize: 1,
        }),
      ).rejects.toThrow();
    }

    const updatedBatchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchActionId },
    });
    expect(updatedBatchAction.status).toBe(BatchActionStatus.Failed);
    expect(updatedBatchAction.log).toContain(
      "failed after 10 consecutive failures",
    );
    expect(
      TraceDeleteBatchActionConfigSchema.parse(updatedBatchAction.config),
    ).toMatchObject({
      failureCount: 10,
      inFlightBatch: null,
    });
  });

  it("runner advances a bounded batch action without queue continuation", async () => {
    const { projectId } = await createOrgProjectAndApiKey({ plan: "Team" });
    const deleteUserId = `delete-user-${randomUUID()}`;
    const beforeCutoff = new Date(Date.now() - 60_000);
    const selectedTraceIds = [randomUUID(), randomUUID()];
    const query = traceDeleteQuery(deleteUserId);

    await prisma.batchAction.updateMany({
      where: {
        actionType: ActionId.TraceDelete,
        tableName: BatchExportTableName.Traces,
        status: {
          in: [BatchActionStatus.Queued, BatchActionStatus.Processing],
        },
      },
      data: {
        status: BatchActionStatus.Failed,
        finishedAt: new Date(),
        log: "Closed by trace delete batch action runner test setup",
      },
    });

    await createLegacyArtifacts({
      projectId,
      traceIds: selectedTraceIds,
      userId: deleteUserId,
      timestamp: beforeCutoff,
    });

    const batchAction = await createTraceDeleteBatchAction({
      projectId,
      userId: `user-${randomUUID()}`,
      useEventsTable: false,
      cutoffCreatedAt: new Date(),
      query,
    });

    const runner = new TraceDeleteBatchActionRunner({
      batchSize: 1,
      maxBatchesPerRun: 1,
      intervalMs: 1_000,
      lockTtlSeconds: 60,
    });

    await runner.processBatch();

    await expectCountsEventually(projectId, selectedTraceIds, {
      traces: 1,
      observations: 1,
      scores: 1,
    });

    const updatedBatchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchAction.id },
    });
    expect(updatedBatchAction.status).toBe(BatchActionStatus.Processing);
    expect(updatedBatchAction.processedCount).toBe(1);
    expect(updatedBatchAction.totalCount).toBeNull();
    expect(updatedBatchAction.config).toMatchObject({
      inFlightBatch: {
        traceIds: [expect.any(String)],
      },
    });
  }, 30_000);
});
