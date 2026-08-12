import { EventType } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import { InAppAgentRunStatus } from "../../index";
import type { PrismaClient } from "../../db";
import {
  createQueuedRun,
  reconcileConversationRuns,
  requestRunCancellation,
} from "./runLifecycle";

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
  });
});
