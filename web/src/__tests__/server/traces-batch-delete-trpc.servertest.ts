const mockAddBatchAction = vi.fn();
const mockGetBatchActionJobState = vi.fn();

vi.mock("@langfuse/shared/src/server", async () => {
  const originalModule = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...originalModule,
    BatchActionQueue: {
      getInstance: vi.fn(() => ({
        add: mockAddBatchAction,
        getJobState: mockGetBatchActionJobState,
      })),
    },
  };
});

import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  ActionId,
  BatchExportTableName,
  BatchActionStatus,
  createTraceDeleteBatchActionConfig,
  TraceDeleteBatchActionConfigSchema,
} from "@langfuse/shared";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

const traceDeleteQuery = (userId: string) => ({
  filter: [
    {
      column: "userId",
      operator: "=" as const,
      value: userId,
      type: "string" as const,
    },
  ],
  orderBy: { column: "timestamp", order: "DESC" as const },
});

const createCaller = async (opts: { v4BetaEnabled?: boolean } = {}) => {
  const { project, org } = await createOrgProjectAndApiKey({ plan: "Team" });
  const session: Session = {
    expires: "1",
    user: {
      id: `user-${randomUUID()}`,
      name: "Batch Delete Test User",
      admin: true,
      v4BetaEnabled: opts.v4BetaEnabled ?? false,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:team",
          cloudConfig: undefined,
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session });
  return {
    projectId: project.id,
    session,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
};

describe("traces.deleteMany batch action", () => {
  beforeEach(() => {
    mockAddBatchAction.mockClear();
    mockGetBatchActionJobState.mockReset();
    mockGetBatchActionJobState.mockResolvedValue("unknown");
  });

  it("creates the trace-delete BatchAction row without a queue payload", async () => {
    const { projectId, session, caller } = await createCaller();
    const userId = `delete-user-${randomUUID()}`;
    const query = traceDeleteQuery(userId);
    const batchActionId = `${projectId}-traces-trace-delete`;

    await caller.traces.deleteMany({
      projectId,
      traceIds: [randomUUID()],
      isBatchAction: true,
      query,
    });

    const batchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchActionId },
    });
    expect(batchAction).toMatchObject({
      projectId,
      userId: session.user.id,
      actionType: "trace-delete",
      tableName: "traces",
      status: BatchActionStatus.Queued,
      totalCount: null,
      processedCount: 0,
      failedCount: 0,
    });
    expect(batchAction.query).toMatchObject({
      ...query,
      useEventsTable: false,
    });
    expect(
      TraceDeleteBatchActionConfigSchema.parse(batchAction.config),
    ).toMatchObject({
      version: 1,
      source: "traces",
      inFlightBatch: null,
    });

    expect(mockAddBatchAction).not.toHaveBeenCalled();
  });

  it("snapshots v4 beta state into an events-backed config", async () => {
    const { projectId, caller } = await createCaller({ v4BetaEnabled: true });
    const batchActionId = `${projectId}-traces-trace-delete`;

    await caller.traces.deleteMany({
      projectId,
      traceIds: [randomUUID()],
      isBatchAction: true,
      query: traceDeleteQuery(`delete-user-${randomUUID()}`),
    });

    const batchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchActionId },
    });
    expect(batchAction.query).toMatchObject({ useEventsTable: true });
    expect(
      TraceDeleteBatchActionConfigSchema.parse(batchAction.config),
    ).toMatchObject({
      source: "events",
      inFlightBatch: null,
    });
  });

  it("does not overwrite an active trace-delete BatchAction row", async () => {
    const { projectId, session, caller } = await createCaller();
    const batchActionId = `${projectId}-traces-trace-delete`;
    const existingQuery = traceDeleteQuery(`existing-user-${randomUUID()}`);

    await prisma.batchAction.create({
      data: {
        id: batchActionId,
        projectId,
        userId: session.user.id,
        actionType: "trace-delete",
        tableName: "traces",
        status: BatchActionStatus.Processing,
        query: {
          ...existingQuery,
          useEventsTable: false,
        },
        config: createTraceDeleteBatchActionConfig({
          useEventsTable: false,
          cutoffCreatedAt: new Date(),
        }),
        totalCount: null,
        processedCount: 1,
        failedCount: 0,
      },
    });

    await expect(
      caller.traces.deleteMany({
        projectId,
        traceIds: [randomUUID()],
        isBatchAction: true,
        query: traceDeleteQuery(`new-user-${randomUUID()}`),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(mockAddBatchAction).not.toHaveBeenCalled();

    const batchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchActionId },
    });
    expect(batchAction.status).toBe(BatchActionStatus.Processing);
    expect(batchAction.processedCount).toBe(1);
    expect(batchAction.query).toMatchObject({
      ...existingQuery,
      useEventsTable: false,
    });
  });

  it("resets a completed trace-delete BatchAction row exactly once", async () => {
    const { projectId, session, caller } = await createCaller();
    const batchActionId = `${projectId}-traces-trace-delete`;
    const completedQuery = traceDeleteQuery(`completed-user-${randomUUID()}`);
    const nextQuery = traceDeleteQuery(`next-user-${randomUUID()}`);

    await prisma.batchAction.create({
      data: {
        id: batchActionId,
        projectId,
        userId: session.user.id,
        actionType: "trace-delete",
        tableName: "traces",
        status: BatchActionStatus.Completed,
        query: {
          ...completedQuery,
          useEventsTable: false,
        },
        config: createTraceDeleteBatchActionConfig({
          useEventsTable: false,
          cutoffCreatedAt: new Date(Date.now() - 1_000),
        }),
        totalCount: 1,
        processedCount: 1,
        failedCount: 0,
        finishedAt: new Date(),
        log: "completed",
      },
    });

    await caller.traces.deleteMany({
      projectId,
      traceIds: [randomUUID()],
      isBatchAction: true,
      query: nextQuery,
    });

    await expect(
      caller.traces.deleteMany({
        projectId,
        traceIds: [randomUUID()],
        isBatchAction: true,
        query: traceDeleteQuery(`conflicting-user-${randomUUID()}`),
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const batchAction = await prisma.batchAction.findUniqueOrThrow({
      where: { id: batchActionId },
    });
    expect(batchAction).toMatchObject({
      status: BatchActionStatus.Queued,
      totalCount: null,
      processedCount: 0,
      failedCount: 0,
      finishedAt: null,
      log: null,
    });
    expect(batchAction.query).toMatchObject({
      ...nextQuery,
      useEventsTable: false,
    });
    expect(batchAction.query).not.toMatchObject({
      ...completedQuery,
      useEventsTable: false,
    });
    expect(mockAddBatchAction).not.toHaveBeenCalled();
  });

  it("reports durable active trace-delete BatchActions as in progress", async () => {
    const { projectId, session, caller } = await createCaller();
    const batchActionId = `${projectId}-traces-trace-delete`;

    await prisma.batchAction.create({
      data: {
        id: batchActionId,
        projectId,
        userId: session.user.id,
        actionType: "trace-delete",
        tableName: "traces",
        status: BatchActionStatus.Processing,
        query: {
          ...traceDeleteQuery(`existing-user-${randomUUID()}`),
          useEventsTable: false,
        },
        config: createTraceDeleteBatchActionConfig({
          useEventsTable: false,
          cutoffCreatedAt: new Date(),
        }),
        totalCount: null,
        processedCount: 1,
        failedCount: 0,
      },
    });

    await expect(
      caller.table.getIsBatchActionInProgress({
        projectId,
        actionId: ActionId.TraceDelete,
        tableName: BatchExportTableName.Traces,
      }),
    ).resolves.toBe(true);
    expect(mockGetBatchActionJobState).not.toHaveBeenCalled();
  });
});
