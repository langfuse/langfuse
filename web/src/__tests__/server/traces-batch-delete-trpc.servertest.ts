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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  ActionId,
  AnnotationQueueObjectType,
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
      canCreateOrganizations: true,
      admin: true,
      v4BetaEnabled: opts.v4BetaEnabled ?? false,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:team",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              hasTraces: true,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
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
      userId: session.user!.id,
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

  it("does not overwrite an active trace-delete BatchAction row", async () => {
    const { projectId, session, caller } = await createCaller();
    const batchActionId = `${projectId}-traces-trace-delete`;
    const existingQuery = traceDeleteQuery(`existing-user-${randomUUID()}`);

    await prisma.batchAction.create({
      data: {
        id: batchActionId,
        projectId,
        userId: session.user!.id,
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
        userId: session.user!.id,
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
        userId: session.user!.id,
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

  it("rejects batch deletes with comment filters without creating a batch action", async () => {
    const { projectId, caller } = await createCaller();
    const batchActionId = `${projectId}-traces-trace-delete`;

    await expect(
      caller.traces.deleteMany({
        projectId,
        traceIds: [randomUUID()],
        isBatchAction: true,
        query: {
          filter: [
            {
              column: "commentCount",
              operator: ">=" as const,
              value: 1,
              type: "number" as const,
            },
          ],
          orderBy: { column: "timestamp", order: "DESC" as const },
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Batch deletion does not support comment filters. Remove the comment filter and try again.",
    });

    await expect(
      prisma.batchAction.findUnique({ where: { id: batchActionId } }),
    ).resolves.toBeNull();
  });

  it("rejects deletes with an empty traceIds array even for batch actions", async () => {
    // An empty selection while select-all is armed signals a client-side
    // consistency issue; the server contract requires at least one traceId
    // for every delete and must fail loudly rather than absorb it.
    const { projectId, caller } = await createCaller();
    const batchActionId = `${projectId}-traces-trace-delete`;

    await expect(
      caller.traces.deleteMany({
        projectId,
        traceIds: [],
        isBatchAction: true,
        query: traceDeleteQuery(`delete-user-${randomUUID()}`),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Minimum 1 traceId is required."),
    });

    await expect(
      prisma.batchAction.findUnique({ where: { id: batchActionId } }),
    ).resolves.toBeNull();
  });

  describe("events-surface declarations (query.useEventsTable)", () => {
    const mutableEnv = env as unknown as {
      LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN: "true" | "false";
    };
    const originalPreviewOptIn =
      mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

    afterEach(() => {
      mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
        originalPreviewOptIn;
    });

    it("creates an events-backed config for non-beta users when the events preview surface is enabled", async () => {
      // The events view is reachable without the per-user v4 beta flag when
      // the instance-wide preview opt-in is set; a dispatch from it must keep
      // reading from the events table so the persisted events-view filters
      // stay valid for the worker.
      mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
      const { projectId, caller } = await createCaller({
        v4BetaEnabled: false,
      });
      const batchActionId = `${projectId}-traces-trace-delete`;

      await caller.traces.deleteMany({
        projectId,
        traceIds: [randomUUID()],
        isBatchAction: true,
        query: {
          ...traceDeleteQuery(`delete-user-${randomUUID()}`),
          useEventsTable: true,
        },
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
      expect(mockAddBatchAction).not.toHaveBeenCalled();
    });

    it("rejects the declaration when neither the beta flag nor the preview surface is enabled", async () => {
      mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
      const { projectId, caller } = await createCaller({
        v4BetaEnabled: false,
      });
      const batchActionId = `${projectId}-traces-trace-delete`;

      await expect(
        caller.traces.deleteMany({
          projectId,
          traceIds: [randomUUID()],
          isBatchAction: true,
          query: {
            ...traceDeleteQuery(`delete-user-${randomUUID()}`),
            useEventsTable: true,
          },
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message:
          "Events-backed batch deletion is not available for this user on this instance.",
      });

      await expect(
        prisma.batchAction.findUnique({ where: { id: batchActionId } }),
      ).resolves.toBeNull();
    });

    it("ignores a client-sent useEventsTable: false and routes on the session snapshot", async () => {
      // Only validated useEventsTable: true declarations are honored —
      // legacy and stale clients can't be trusted to set the flag correctly,
      // so a client-sent false is ignored and the session's v4 beta flag
      // snapshot decides the source: a beta user stays events-backed.
      const { projectId, caller } = await createCaller({
        v4BetaEnabled: true,
      });
      const batchActionId = `${projectId}-traces-trace-delete`;

      await caller.traces.deleteMany({
        projectId,
        traceIds: [randomUUID()],
        isBatchAction: true,
        query: {
          ...traceDeleteQuery(`delete-user-${randomUUID()}`),
          useEventsTable: false,
        },
      });

      const batchAction = await prisma.batchAction.findUniqueOrThrow({
        where: { id: batchActionId },
      });
      expect(batchAction.query).toMatchObject({ useEventsTable: true });
      expect(
        TraceDeleteBatchActionConfigSchema.parse(batchAction.config),
      ).toMatchObject({ source: "events", inFlightBatch: null });
    });

    it("falls back to the session flag when the client declares no surface", async () => {
      // Dispatches without query.useEventsTable (stale clients mid-deploy,
      // out-of-tree callers) route on the session's v4 beta flag alone; the
      // instance-wide preview opt-in is irrelevant without a declaration.
      mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";

      const beta = await createCaller({ v4BetaEnabled: true });
      await beta.caller.traces.deleteMany({
        projectId: beta.projectId,
        traceIds: [randomUUID()],
        isBatchAction: true,
        query: traceDeleteQuery(`delete-user-${randomUUID()}`),
      });

      const betaBatchAction = await prisma.batchAction.findUniqueOrThrow({
        where: { id: `${beta.projectId}-traces-trace-delete` },
      });
      expect(betaBatchAction.query).toMatchObject({ useEventsTable: true });
      expect(
        TraceDeleteBatchActionConfigSchema.parse(betaBatchAction.config),
      ).toMatchObject({ source: "events", inFlightBatch: null });

      const nonBeta = await createCaller({ v4BetaEnabled: false });
      await nonBeta.caller.traces.deleteMany({
        projectId: nonBeta.projectId,
        traceIds: [randomUUID()],
        isBatchAction: true,
        query: traceDeleteQuery(`delete-user-${randomUUID()}`),
      });

      const nonBetaBatchAction = await prisma.batchAction.findUniqueOrThrow({
        where: { id: `${nonBeta.projectId}-traces-trace-delete` },
      });
      expect(nonBetaBatchAction.query).toMatchObject({ useEventsTable: false });
      expect(
        TraceDeleteBatchActionConfigSchema.parse(nonBetaBatchAction.config),
      ).toMatchObject({ source: "traces" });
    });
  });

  describe("with legacy IO search disabled", () => {
    const mutableEnv = env as unknown as {
      LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH: "true" | "false";
    };
    const originalLegacyIoSearchDisabled =
      mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH;

    afterEach(() => {
      mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH =
        originalLegacyIoSearchDisabled;
    });

    const ioSearchQuery = (userId: string) => ({
      ...traceDeleteQuery(userId),
      searchQuery: "some full-text query",
      searchType: ["id" as const, "content" as const],
    });

    // Literal owned by the module-private LEGACY_IO_SEARCH_BATCH_JOB_ERROR_MESSAGE
    // in web/src/features/traces/server/legacyIoSearch.ts.
    const legacyIoSearchErrorMessage =
      "Input/output search is disabled for legacy tracing tables on this instance. Switch to ID, name, or user ID search before creating a batch job.";

    it("allows v4 (events-backed) batch deletes with full-text search", async () => {
      mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH = "true";
      const { projectId, caller } = await createCaller({
        v4BetaEnabled: true,
      });
      const batchActionId = `${projectId}-traces-trace-delete`;

      await caller.traces.deleteMany({
        projectId,
        traceIds: [randomUUID()],
        isBatchAction: true,
        query: ioSearchQuery(`delete-user-${randomUUID()}`),
      });

      const batchAction = await prisma.batchAction.findUniqueOrThrow({
        where: { id: batchActionId },
      });
      expect(batchAction.status).toBe(BatchActionStatus.Queued);
      expect(batchAction.query).toMatchObject({
        useEventsTable: true,
        searchQuery: "some full-text query",
        searchType: ["id", "content"],
      });
      expect(
        TraceDeleteBatchActionConfigSchema.parse(batchAction.config),
      ).toMatchObject({ source: "events" });
    });

    it("still rejects non-TraceDelete batch actions with full-text search for v4 users", async () => {
      // Only TraceDelete's worker path honors useEventsTable; other batch
      // actions (here: trace add-to-annotation-queue) read from the legacy
      // traces table and must keep the strict legacy IO-search guard even
      // when the dispatching user is v4-flagged.
      mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH = "true";
      const { projectId, caller } = await createCaller({
        v4BetaEnabled: true,
      });

      await expect(
        caller.annotationQueueItems.createMany({
          projectId,
          queueId: randomUUID(),
          objectIds: [randomUUID()],
          objectType: AnnotationQueueObjectType.TRACE,
          isBatchAction: true,
          query: ioSearchQuery(`queue-user-${randomUUID()}`),
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: legacyIoSearchErrorMessage,
      });

      expect(mockAddBatchAction).not.toHaveBeenCalled();
    });

    it("still rejects legacy (traces-backed) batch deletes with full-text search", async () => {
      mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH = "true";
      const { projectId, caller } = await createCaller({
        v4BetaEnabled: false,
      });
      const batchActionId = `${projectId}-traces-trace-delete`;

      await expect(
        caller.traces.deleteMany({
          projectId,
          traceIds: [randomUUID()],
          isBatchAction: true,
          query: ioSearchQuery(`delete-user-${randomUUID()}`),
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: legacyIoSearchErrorMessage,
      });

      await expect(
        prisma.batchAction.findUnique({ where: { id: batchActionId } }),
      ).resolves.toBeNull();
    });
  });
});
