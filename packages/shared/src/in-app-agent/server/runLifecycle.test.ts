import { describe, expect, it, vi } from "vitest";

import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "../../index";
import type { PrismaClient } from "../../db";
import {
  findInAppAgentLifecycleWork,
  reconcileConversationRuns,
  requestRunCancellation,
} from "./runLifecycle";

describe("in-app agent run lifecycle races", () => {
  it("preserves cancellation when a worker claims the queued run concurrently", async () => {
    let status: InAppAgentRunStatus = InAppAgentRunStatus.QUEUED;
    let cancelRequestedAt: Date | null = null;

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
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

describe("global lifecycle work selection", () => {
  const ago = (ms: number) => new Date(Date.now() - ms);

  const candidate = (
    id: string,
    overrides: {
      status: InAppAgentRunStatus;
      createdAt: Date;
      claimedAt?: Date | null;
      heartbeatAt?: Date | null;
    },
  ) => ({
    id,
    projectId: "project-1",
    conversationId: `conversation-${id}`,
    claimedAt: null,
    heartbeatAt: null,
    finishedAt: null,
    mcpApiKeyId: null,
    ...overrides,
  });

  const fakePrisma = (rows: unknown[]) => {
    const findMany = vi.fn().mockResolvedValue(rows);
    const $transaction = vi.fn();

    return {
      prisma: {
        inAppAgentRun: { findMany },
        $transaction,
      } as unknown as PrismaClient,
      findMany,
      $transaction,
    };
  };

  it("classifies a mixed batch in one read without a transaction per candidate", async () => {
    const { prisma, findMany, $transaction } = fakePrisma([
      candidate("queue-timeout", {
        status: InAppAgentRunStatus.QUEUED,
        createdAt: ago(6 * 60_000),
      }),
      candidate("worker-lost", {
        status: InAppAgentRunStatus.RUNNING,
        createdAt: ago(5 * 60_000),
        claimedAt: ago(5 * 60_000),
        heartbeatAt: ago(90_000),
      }),
      candidate("run-timeout", {
        status: InAppAgentRunStatus.RUNNING,
        createdAt: ago(20 * 60_000),
        claimedAt: ago(20 * 60_000),
        heartbeatAt: new Date(),
      }),
      candidate("redispatch", {
        status: InAppAgentRunStatus.QUEUED,
        createdAt: ago(30_000),
      }),
    ]);

    const work = await findInAppAgentLifecycleWork({
      prisma,
      redispatchLimit: 50,
      terminalizeLimit: 50,
    });

    expect(
      work.terminalize.map((item) => [item.run.id, item.errorCode]),
    ).toEqual([
      ["queue-timeout", InAppAgentRunErrorCode.QUEUE_TIMEOUT],
      ["worker-lost", InAppAgentRunErrorCode.WORKER_LOST],
      ["run-timeout", InAppAgentRunErrorCode.RUN_TIMEOUT],
    ]);
    // A run past its queue timeout is terminalized, never woken up again.
    expect(work.redispatch.map((entry) => entry.runId)).toEqual(["redispatch"]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("bounds redispatch and terminal work independently, oldest first", async () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`stale-${index}`, {
          status: InAppAgentRunStatus.QUEUED,
          createdAt: ago(10 * 60_000 + index),
        }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`fresh-${index}`, {
          status: InAppAgentRunStatus.QUEUED,
          createdAt: ago(30_000 + index),
        }),
      ),
    ];

    const work = await findInAppAgentLifecycleWork({
      prisma: fakePrisma(rows).prisma,
      redispatchLimit: 2,
      terminalizeLimit: 2,
    });

    expect(work.candidateCount).toBe(8);
    expect(work.terminalize.map((item) => item.run.id)).toEqual([
      "stale-0",
      "stale-1",
    ]);
    expect(work.redispatch.map((entry) => entry.runId)).toEqual([
      "fresh-0",
      "fresh-1",
    ]);
  });
});
