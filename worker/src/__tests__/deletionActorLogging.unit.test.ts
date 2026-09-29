import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatchActionType, BatchTableNames } from "@langfuse/shared";
import type { BatchActionProcessingEventType } from "@langfuse/shared/src/server";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  pendingDeletionFindMany: vi.fn(),
  traceDeletionProcessor: vi.fn(),
  processClickhouseTraceDelete: vi.fn(),
  processPostgresTraceDelete: vi.fn(),
  getTraceIdentifierStream: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    pendingDeletion: {
      findMany: mocks.pendingDeletionFindMany,
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  // The real formatting is covered in packages/shared traceDeletionProcessor.test.ts
  formatDeletionActor: (actor: {
    type: string;
    userId?: string;
    publicKey?: string;
  }) =>
    actor.type === "API_KEY"
      ? `API key ${actor.publicKey}`
      : `user ${actor.userId}`,
  getCurrentSpan: vi.fn(() => undefined),
  logger: { info: mocks.loggerInfo, debug: vi.fn(), error: vi.fn() },
  shouldSkipDeletionFor: vi.fn().mockResolvedValue(false),
  traceDeletionProcessor: mocks.traceDeletionProcessor,
  applyCommentFilters: vi.fn(),
  getEventsStreamForEval: vi.fn(),
  CreateEvalQueue: { getInstance: vi.fn() },
  findDatasetIdsForBatchDeletion: vi.fn(),
}));

vi.mock("../features/traces/processClickhouseTraceDelete", () => ({
  processClickhouseTraceDelete: mocks.processClickhouseTraceDelete,
}));

vi.mock("../features/traces/processPostgresTraceDelete", () => ({
  processPostgresTraceDelete: mocks.processPostgresTraceDelete,
}));

vi.mock("../features/database-read-stream/getDatabaseReadStream", () => ({
  getTraceIdentifierStream: mocks.getTraceIdentifierStream,
  getDatabaseReadStreamPaginated: vi.fn(),
}));

import { traceDeleteProcessor } from "../queues/traceDelete";
import { handleBatchActionJob } from "../features/batchAction/handleBatchActionJob";

const runTraceDeleteJob = (payload: Record<string, unknown>) =>
  traceDeleteProcessor({ data: { payload } } as never);

const traceIdStream = (ids: string[]) =>
  (async function* () {
    for (const id of ids) yield { id };
  })();

const traceDeleteBatchPayload = (userId?: string) =>
  ({
    actionId: "trace-delete",
    projectId: "project-1",
    tableName: BatchTableNames.Traces,
    cutoffCreatedAt: new Date(),
    query: { filter: [], orderBy: null },
    type: BatchActionType.Delete,
    userId,
  }) as BatchActionProcessingEventType;

describe("trace delete queue actor logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingDeletionFindMany.mockResolvedValue([]);
  });

  it("logs the requesting API key for the job's trace ids", async () => {
    await runTraceDeleteJob({
      projectId: "project-1",
      traceIds: ["trace-1", "trace-2"],
      actor: {
        type: "API_KEY",
        apiKeyId: "api-key-1",
        publicKey: "pk-lf-test",
      },
    });

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Trace deletion job for 2 traces in project project-1 requested by API key pk-lf-test",
      expect.objectContaining({
        projectId: "project-1",
        traceIds: ["trace-1", "trace-2"],
      }),
    );
    expect(mocks.processClickhouseTraceDelete).toHaveBeenCalledWith(
      "project-1",
      ["trace-1", "trace-2"],
    );
  });

  it("does not log an actor line for jobs enqueued without an actor", async () => {
    await runTraceDeleteJob({ projectId: "project-1", traceIds: ["trace-1"] });

    expect(mocks.loggerInfo).not.toHaveBeenCalledWith(
      expect.stringContaining("requested by"),
      expect.anything(),
    );
    expect(mocks.processClickhouseTraceDelete).toHaveBeenCalledWith(
      "project-1",
      ["trace-1"],
    );
  });
});

describe("legacy batch action actor propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.traceDeletionProcessor.mockResolvedValue(undefined);
  });

  it("passes the requesting user to the trace deletion processor", async () => {
    mocks.getTraceIdentifierStream.mockResolvedValue(
      traceIdStream(["trace-1", "trace-2"]),
    );

    await handleBatchActionJob({
      payload: traceDeleteBatchPayload("user-1"),
    } as never);

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Processing batch action trace-delete in project project-1 requested by user user-1",
      expect.objectContaining({ actorType: "USER", userId: "user-1" }),
    );
    expect(mocks.traceDeletionProcessor).toHaveBeenCalledWith(
      "project-1",
      ["trace-1", "trace-2"],
      { delayMs: 0, actor: { type: "USER", userId: "user-1" } },
    );
  });

  it("omits the actor for jobs enqueued before userId existed", async () => {
    mocks.getTraceIdentifierStream.mockResolvedValue(
      traceIdStream(["trace-1"]),
    );

    await handleBatchActionJob({
      payload: traceDeleteBatchPayload(undefined),
    } as never);

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Processing batch action trace-delete in project project-1 requested by user unknown",
      expect.anything(),
    );
    expect(mocks.traceDeletionProcessor).toHaveBeenCalledWith(
      "project-1",
      ["trace-1"],
      { delayMs: 0, actor: undefined },
    );
  });
});
