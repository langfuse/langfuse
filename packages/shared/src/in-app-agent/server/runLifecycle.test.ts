import { EventType } from "@ag-ui/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
} from "../../features/inAppAgent/types";
import { Prisma, type PrismaClient } from "../../db";
import { logger } from "../../server";
import {
  cleanupTerminalRunMcpApiKeys,
  createQueuedRun,
  reconcileConversationRuns,
  requestRunCancellation,
} from "./runLifecycle";

const metricMocks = vi.hoisted(() => ({
  recordRunTerminalOutcome: vi.fn(),
}));

vi.mock("./runMetrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runMetrics")>()),
  recordRunTerminalOutcome: metricMocks.recordRunTerminalOutcome,
}));

beforeEach(() => {
  metricMocks.recordRunTerminalOutcome.mockClear();
});

describe("in-app agent run lifecycle races", () => {
  it("does not admit a run after the conversation is deleted", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ deletedAt: new Date() }]),
      inAppAgentRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "run-1" }),
      },
      inAppAgentEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      inAppAgentConversation: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as PrismaClient;

    await expect(
      createQueuedRun({
        prisma,
        runId: "run-1",
        projectId: "project-1",
        conversationId: "conversation-1",
        triggeredByUserId: "user-1",
        model: "test-model",
        request: { kind: "userMessage", context: [] },
        runStartedEvent: {
          type: EventType.RUN_STARTED,
          threadId: "conversation-1",
          runId: "run-1",
        },
      }),
    ).rejects.toThrow("Agent conversation not found");
    expect(tx.inAppAgentRun.create).not.toHaveBeenCalled();
  });

  it("preserves cancellation when a worker claims the queued run concurrently", async () => {
    let status: InAppAgentRunStatus = InAppAgentRunStatus.QUEUED;
    let cancelRequestedAt: Date | null = null;

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ deletedAt: null }]),
      inAppAgentRun: {
        findFirst: vi.fn(async () => ({ status })),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { status: InAppAgentRunStatus };
            data: {
              status?: InAppAgentRunStatus;
              cancelRequestedAt?: Date;
            };
          }) => {
            if (where.status === InAppAgentRunStatus.QUEUED) {
              status = InAppAgentRunStatus.RUNNING;
              return { count: 0 };
            }

            if (
              where.status === InAppAgentRunStatus.RUNNING &&
              status === InAppAgentRunStatus.RUNNING
            ) {
              cancelRequestedAt = data.cancelRequestedAt ?? null;
              return { count: 1 };
            }

            return { count: 0 };
          },
        ),
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as PrismaClient;

    await expect(
      requestRunCancellation({
        prisma,
        projectId: "project-1",
        conversationId: "conversation-1",
        runId: "run-1",
      }),
    ).resolves.toEqual({
      cancelledImmediately: false,
      status: InAppAgentRunStatus.RUNNING,
    });
    expect(cancelRequestedAt).toBeInstanceOf(Date);
  });

  it("does not reconcile a worker-lost candidate after its heartbeat renews", async () => {
    const observedHeartbeat = new Date(Date.now() - 90_000);
    const renewedHeartbeat = new Date();
    const updateMany = vi.fn(
      async ({ where }: { where: { heartbeatAt?: Date | null } }) => ({
        count:
          where.heartbeatAt?.getTime() === renewedHeartbeat.getTime() ? 1 : 0,
      }),
    );
    const tx = {
      inAppAgentRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-1",
            status: InAppAgentRunStatus.RUNNING,
            createdAt: new Date(Date.now() - 120_000),
            claimedAt: new Date(Date.now() - 120_000),
            heartbeatAt: observedHeartbeat,
            finishedAt: null,
          },
        ]),
        updateMany,
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as PrismaClient;

    await expect(
      reconcileConversationRuns({
        prisma,
        projectId: "project-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toEqual([]);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ heartbeatAt: observedHeartbeat }),
      }),
    );
    expect(metricMocks.recordRunTerminalOutcome).not.toHaveBeenCalled();
  });

  it("reports a reconciled run's outcome once, after the transition commits", async () => {
    const tx = {
      inAppAgentRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-1",
            status: InAppAgentRunStatus.QUEUED,
            createdAt: new Date(Date.now() - 10 * 60_000),
            claimedAt: null,
            heartbeatAt: null,
            finishedAt: null,
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as PrismaClient;

    await expect(
      reconcileConversationRuns({
        prisma,
        projectId: "project-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toEqual([
      { runId: "run-1", errorCode: InAppAgentRunErrorCode.QUEUE_TIMEOUT },
    ]);
    expect(metricMocks.recordRunTerminalOutcome).toHaveBeenCalledTimes(1);
    expect(metricMocks.recordRunTerminalOutcome).toHaveBeenCalledWith({
      status: InAppAgentRunStatus.FAILED,
      errorCode: InAppAgentRunErrorCode.QUEUE_TIMEOUT,
    });
  });

  it("records a queued cancel with the cancelled error code after commit", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ deletedAt: null }]),
      inAppAgentRun: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ status: InAppAgentRunStatus.QUEUED }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as PrismaClient;

    await expect(
      requestRunCancellation({
        prisma,
        projectId: "project-1",
        conversationId: "conversation-1",
        runId: "run-1",
      }),
    ).resolves.toEqual({
      cancelledImmediately: true,
      status: InAppAgentRunStatus.CANCELLED,
      errorCode: InAppAgentRunErrorCode.CANCELLED,
    });
    expect(metricMocks.recordRunTerminalOutcome).toHaveBeenCalledTimes(1);
    expect(metricMocks.recordRunTerminalOutcome).toHaveBeenCalledWith({
      status: InAppAgentRunStatus.CANCELLED,
      errorCode: InAppAgentRunErrorCode.CANCELLED,
    });
  });

  it("records a prior stale run when admitting a new message", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ deletedAt: null }]),
      inAppAgentRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-old",
            status: InAppAgentRunStatus.QUEUED,
            createdAt: new Date(Date.now() - 10 * 60_000),
            claimedAt: null,
            heartbeatAt: null,
            finishedAt: null,
          },
        ]),
        updateMany: vi.fn(
          async ({ data }: { data: { status?: InAppAgentRunStatus } }) => ({
            count: data.status === InAppAgentRunStatus.FAILED ? 1 : 0,
          }),
        ),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "run-1" }),
      },
      inAppAgentEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      inAppAgentConversation: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as PrismaClient;

    await createQueuedRun({
      prisma,
      runId: "run-1",
      projectId: "project-1",
      conversationId: "conversation-1",
      triggeredByUserId: "user-1",
      model: "test-model",
      request: { kind: "userMessage", context: [] },
      runStartedEvent: {
        type: EventType.RUN_STARTED,
        threadId: "conversation-1",
        runId: "run-1",
      },
    });

    expect(metricMocks.recordRunTerminalOutcome).toHaveBeenCalledTimes(1);
    expect(metricMocks.recordRunTerminalOutcome).toHaveBeenCalledWith({
      status: InAppAgentRunStatus.FAILED,
      errorCode: InAppAgentRunErrorCode.QUEUE_TIMEOUT,
    });
  });

  it("does not record a reconciled outcome when admitting the next run fails", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ deletedAt: null }]),
      inAppAgentRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-old",
            status: InAppAgentRunStatus.QUEUED,
            createdAt: new Date(Date.now() - 10 * 60_000),
            claimedAt: null,
            heartbeatAt: null,
            finishedAt: null,
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ id: "active-run" }),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as PrismaClient;

    await expect(
      createQueuedRun({
        prisma,
        runId: "run-1",
        projectId: "project-1",
        conversationId: "conversation-1",
        triggeredByUserId: "user-1",
        model: "test-model",
        request: { kind: "userMessage", context: [] },
        runStartedEvent: {
          type: EventType.RUN_STARTED,
          threadId: "conversation-1",
          runId: "run-1",
        },
      }),
    ).rejects.toThrow("Assistant is already responding in this conversation");
    expect(metricMocks.recordRunTerminalOutcome).not.toHaveBeenCalled();
  });
});

describe("cleanupTerminalRunMcpApiKeys", () => {
  const missingKeyError = new Prisma.PrismaClientKnownRequestError(
    "No record was found for a delete.",
    { code: "P2025", clientVersion: "test" },
  );

  it("clears the pointer when the API key row is already gone", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      inAppAgentRun: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "run-1", mcpApiKeyId: "key-1" }]),
        updateMany,
      },
    } as unknown as PrismaClient;
    const errorSpy = vi.spyOn(logger, "error");

    try {
      await expect(
        cleanupTerminalRunMcpApiKeys({
          prisma,
          projectId: "project-1",
          conversationId: "conversation-1",
          deleteApiKey: async () => {
            throw missingKeyError;
          },
        }),
      ).resolves.toBe(1);
    } finally {
      errorSpy.mockRestore();
    }

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "run-1", projectId: "project-1" },
      data: { mcpApiKeyId: null },
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
