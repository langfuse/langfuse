import { EventType } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "../../index";
import type { PrismaClient } from "../../db";
import {
  createQueuedRun,
  decideToolApprovalBatch,
  reconcileConversationRuns,
  requestRunCancellation,
} from "./runLifecycle";

describe("in-app agent run lifecycle races", () => {
  it("records one complete approval batch and reuses its continuation on retry", async () => {
    let parentStatus = InAppAgentRunStatus.AWAITING_APPROVAL;
    let continuation: {
      id: string;
      request: unknown;
      status: InAppAgentRunStatus;
      errorCode: string | null;
    } | null = null;
    const events: unknown[] = [];
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ deletedAt: null }]),
      inAppAgentRun: {
        findFirst: vi.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            if (where.id === "run-parent") {
              return {
                status: parentStatus,
                finishedAt: new Date(),
                request: {
                  kind: "approvalDecision",
                  parentRunId: "run-root",
                  toolCallId: "previous-tool-call",
                  approved: true,
                },
              };
            }
            if (where.id === "run-root") {
              return {
                request: {
                  kind: "userMessage",
                  turnId: "run-root",
                  context: [],
                },
              };
            }

            const requestedFingerprint = (
              where.AND as Array<{
                request?: { path?: string[]; equals?: string };
              }>
            )?.find((condition) =>
              condition.request?.path?.includes("batchFingerprint"),
            )?.request?.equals;
            const persistedFingerprint = (
              continuation?.request as { batchFingerprint?: string } | undefined
            )?.batchFingerprint;
            return requestedFingerprint === persistedFingerprint
              ? continuation
              : null;
          },
        ),
        updateMany: vi.fn(async ({ where }: { where: { id?: string } }) => {
          if (where.id === "run-continuation" && continuation) {
            continuation.status = InAppAgentRunStatus.QUEUED;
            continuation.errorCode = null;
            return { count: 1 };
          }
          if (parentStatus !== InAppAgentRunStatus.AWAITING_APPROVAL) {
            return { count: 0 };
          }
          parentStatus = InAppAgentRunStatus.SUCCEEDED;
          return { count: 1 };
        }),
        create: vi.fn(
          async ({ data }: { data: { id: string; request: unknown } }) => {
            continuation = {
              id: data.id,
              request: data.request,
              status: InAppAgentRunStatus.QUEUED,
              errorCode: null,
            };
            return continuation;
          },
        ),
      },
      inAppAgentEvent: {
        findFirst: vi.fn(async () =>
          events.length > 0 ? { sequenceNumber: events.length - 1 } : null,
        ),
        create: vi.fn(async ({ data }: { data: { event: unknown } }) => {
          events.push(data.event);
          return data;
        }),
      },
      inAppAgentConversation: {
        findUnique: vi.fn().mockResolvedValue({ alwaysAllowedTools: [] }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as PrismaClient;
    const params = {
      prisma,
      projectId: "project-1",
      conversationId: "conversation-1",
      interruptedRunId: "run-parent",
      continuationRunId: "run-continuation",
      openInterruptIds: ["interrupt-1", "interrupt-2"],
      resume: [
        {
          interruptId: "interrupt-1",
          status: "resolved" as const,
          payload: { approved: false, approvalScope: "once" as const },
        },
        {
          interruptId: "interrupt-2",
          status: "resolved" as const,
          payload: { approved: true, approvalScope: "conversation" as const },
        },
      ],
      toolCallIdsByInterruptId: {
        "interrupt-1": "tool-call-1",
        "interrupt-2": "tool-call-2",
      },
      alwaysAllowToolNamesByInterruptId: {
        "interrupt-2": "langfuse_createTextPrompt" as const,
      },
      decidedByUserId: "user-1",
      model: "test-model",
    };

    await expect(
      decideToolApprovalBatch({ ...params, resume: params.resume.slice(0, 1) }),
    ).rejects.toThrow("Every pending approval must be decided");
    await expect(decideToolApprovalBatch(params)).resolves.toMatchObject({
      run: { id: "run-continuation" },
      shouldEnqueue: true,
    });
    continuation!.status = InAppAgentRunStatus.FAILED;
    continuation!.errorCode = InAppAgentRunErrorCode.ENQUEUE_FAILED;
    await expect(decideToolApprovalBatch(params)).resolves.toMatchObject({
      run: { id: "run-continuation", status: InAppAgentRunStatus.QUEUED },
      shouldEnqueue: true,
    });
    await expect(decideToolApprovalBatch(params)).resolves.toMatchObject({
      run: { id: "run-continuation", status: InAppAgentRunStatus.QUEUED },
      shouldEnqueue: true,
    });
    await expect(
      decideToolApprovalBatch({
        ...params,
        resume: params.resume.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                payload: { approved: true, approvalScope: "once" as const },
              }
            : entry,
        ),
      }),
    ).rejects.toThrow("This approval is no longer pending");

    expect(tx.inAppAgentRun.create).toHaveBeenCalledOnce();
    expect(continuation!.request).toEqual(
      expect.objectContaining({ turnId: "run-root" }),
    );
    expect(tx.inAppAgentConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          alwaysAllowedTools: ["langfuse_createTextPrompt"],
        },
      }),
    );
    expect(events).toEqual([
      expect.objectContaining({
        name: "langfuse_approval_decision",
        value: expect.objectContaining({
          toolCallId: "tool-call-1",
          approved: false,
        }),
      }),
      expect.objectContaining({
        name: "langfuse_approval_decision",
        value: expect.objectContaining({
          toolCallId: "tool-call-2",
          approved: true,
          scope: "conversation",
        }),
      }),
      expect.objectContaining({
        type: EventType.RUN_STARTED,
        threadId: "conversation-1",
        runId: "run-continuation",
        input: expect.objectContaining({ resume: params.resume }),
      }),
    ]);
  });

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
