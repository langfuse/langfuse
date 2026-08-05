import { EventType } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";

vi.mock("@langfuse/shared/src/server", () => ({
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
  InAppAgentRunQueue: { getInstance: vi.fn() },
  QueueJobs: { InAppAgentRunJob: "in-app-agent-run" },
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() },
  redis: null,
}));

import { getBackgroundConversationSnapshot } from "@/src/features/in-app-agent/server/backgroundRunService";

describe("getBackgroundConversationSnapshot", () => {
  it("does not combine a terminal run with an event cursor from before that commit", async () => {
    const projectId = "project-1";
    const conversationId = "conversation-1";
    const userId = "user-1";
    const runId = "run-1";
    const now = new Date("2026-08-04T08:00:00.000Z");
    const conversation = {
      id: conversationId,
      projectId,
      createdByUserId: userId,
      title: "Snapshot consistency",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const eventsBeforeCommit = [
      {
        sequenceNumber: 0,
        runId,
        createdAt: now,
        event: {
          type: EventType.RUN_STARTED,
          threadId: conversationId,
          runId,
          input: {
            threadId: conversationId,
            runId,
            state: null,
            messages: [
              { id: "user-message", role: "user", content: "Investigate" },
            ],
          },
        },
      },
    ];

    const runRow = (status: InAppAgentRunStatus) => ({
      id: runId,
      status,
      errorCode: null,
      cancelRequestedAt: null,
    });
    const createReadView = (snapshotRunStatus: InAppAgentRunStatus) => ({
      inAppAgentEvent: {
        findMany: vi.fn().mockResolvedValue(eventsBeforeCommit),
      },
      inAppAgentRun: {
        findMany: vi.fn(async (args?: { orderBy?: unknown }) =>
          args?.orderBy ? [runRow(snapshotRunStatus)] : [],
        ),
      },
    });
    const rootReadView = createReadView(InAppAgentRunStatus.SUCCEEDED);
    const prisma = {
      ...rootReadView,
      inAppAgentConversation: {
        findFirst: vi.fn().mockResolvedValue(conversation),
      },
      $transaction: vi.fn(
        async (
          callback: (tx: ReturnType<typeof createReadView>) => Promise<unknown>,
          options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
        ) => {
          // Independent READ COMMITTED statements can straddle the worker's
          // atomic terminal commit: events see RUNNING while runs see SUCCEEDED.
          // A repeatable snapshot must keep both reads on the earlier version.
          const hasRepeatableSnapshot =
            options?.isolationLevel ===
              Prisma.TransactionIsolationLevel.RepeatableRead ||
            options?.isolationLevel ===
              Prisma.TransactionIsolationLevel.Serializable;
          return callback(
            createReadView(
              hasRepeatableSnapshot
                ? InAppAgentRunStatus.RUNNING
                : InAppAgentRunStatus.SUCCEEDED,
            ),
          );
        },
      ),
    } as unknown as PrismaClient;

    const snapshot = await getBackgroundConversationSnapshot({
      prisma,
      projectId,
      conversationId,
      userId,
    });

    expect({
      eventCursor: snapshot.eventCursor,
      runStatus: snapshot.latestRun?.status,
    }).toEqual({
      eventCursor: 0,
      runStatus: InAppAgentRunStatus.RUNNING,
    });
  });
});
