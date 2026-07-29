/**
 * Behavioral coverage for the background execution surface: submit, cancel,
 * decide, and reconcile-on-read. These go through the tRPC callers rather than
 * the lifecycle helpers directly, because the contracts worth protecting are
 * the ones a browser can actually reach.
 */
import type { Session } from "next-auth";
import type { Flags } from "@/src/features/feature-flags/types";
import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  type Plan,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createInAppAgentConversationId,
  createInAppAgentRunId,
  IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME,
} from "@langfuse/shared/in-app-agent";
import { ensureOwnedConversation } from "@langfuse/shared/in-app-agent/server/persistence";
import { env } from "@/src/env.mjs";
import { inAppAgentRouter } from "@/src/features/in-app-agent/server/router";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

import type * as SharedServerModule from "@langfuse/shared/src/server";

const enqueuedJobs: Array<{ name: string; payload: unknown; jobId?: string }> =
  [];
let enqueueShouldFail = false;

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual<typeof SharedServerModule>(
    "@langfuse/shared/src/server",
  );

  return {
    ...actual,
    InAppAgentRunQueue: {
      getInstance: () => ({
        add: (name: string, payload: unknown, options?: { jobId?: string }) => {
          if (enqueueShouldFail) {
            throw new Error("queue unavailable");
          }
          enqueuedJobs.push({ name, payload, jobId: options?.jobId });
          return Promise.resolve();
        },
        remove: () => Promise.resolve(),
      }),
    },
  };
});

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

describe("in-app agent background runs", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalBedrockModel = env.LANGFUSE_AWS_BEDROCK_MODEL;

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = "test-model";
    enqueuedJobs.length = 0;
    enqueueShouldFail = false;
  });

  afterEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = originalBedrockModel;
  });

  const createCaller = async (
    userId = `user-${randomUUID()}`,
    plan: Plan = "cloud:hobby",
  ) => {
    const setup = await createOrgProjectAndApiKey();

    await prisma.organization.update({
      where: { id: setup.orgId },
      data: { aiFeaturesEnabled: true },
    });

    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com` },
    });

    const session: Session = {
      expires: "1",
      user: {
        id: userId,
        name: "Agent User",
        canCreateOrganizations: true,
        organizations: [
          {
            id: setup.orgId,
            role: "OWNER",
            plan,
            cloudConfig: undefined,
            name: "Test Organization",
            metadata: {},
            aiFeaturesEnabled: true,
            aiTelemetryEnabled: false,
            projects: [
              {
                id: setup.projectId,
                role: "ADMIN",
                name: "Test Project",
                deletedAt: null,
                retentionDays: null,
                hasTraces: false,
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
        featureFlags: {} as Flags,
        admin: false,
      },
      environment: {} as any,
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });

    return {
      ...setup,
      userId,
      caller: inAppAgentRouter.createCaller({ ...ctx, prisma }),
    };
  };

  const createConversation = async (params: {
    projectId: string;
    userId: string;
  }) =>
    ensureOwnedConversation({
      prisma,
      projectId: params.projectId,
      conversationId: createInAppAgentConversationId(),
      userId: params.userId,
    });

  /** Park a run for approval the way the worker does: interrupt event, then CAS. */
  const parkRunForApproval = async (params: {
    projectId: string;
    conversationId: string;
    userId: string;
    toolCallId: string;
    parkedAt?: Date;
  }) => {
    const runId = createInAppAgentRunId();

    await prisma.inAppAgentRun.create({
      data: {
        id: runId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        triggeredByUserId: params.userId,
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
        finishedAt: params.parkedAt ?? new Date(),
        request: { kind: "userMessage", context: [] },
      },
    });

    await prisma.inAppAgentEvent.create({
      data: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        runId,
        sequenceNumber: 0,
        type: EventType.CUSTOM,
        event: {
          type: EventType.CUSTOM,
          name: "on_interrupt",
          value: {
            type: "mastra_suspend",
            toolCallId: params.toolCallId,
            toolName: "langfuse_createTextPrompt",
            args: { name: "from-persisted-event" },
            runId,
          },
        },
      },
    });

    return runId;
  };

  it("commits a queued run with its user message and enqueues it by run id", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    const { runId } = await caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "why did these traces fail?",
      context: [{ description: "current_url", value: "/project/x/traces" }],
    });

    const run = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: runId, projectId },
    });

    expect(run.status).toBe(InAppAgentRunStatus.QUEUED);
    expect(run.finishedAt).toBeNull();
    expect(run.request).toMatchObject({ kind: "userMessage" });

    // The worker never writes RUN_STARTED and reads the turn's input from it,
    // so a missing or misshaped row silently yields an empty replay history.
    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id },
      orderBy: { sequenceNumber: "asc" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      runId,
      sequenceNumber: 0,
      type: EventType.RUN_STARTED,
    });
    expect(events[0]?.event).toMatchObject({
      type: EventType.RUN_STARTED,
      runId,
      input: {
        messages: [{ role: "user", content: "why did these traces fail?" }],
      },
    });

    expect(enqueuedJobs).toEqual([
      expect.objectContaining({
        jobId: runId,
        payload: expect.objectContaining({
          payload: { projectId, runId },
        }),
      }),
    ]);
  });

  it("rejects a second submit while a run is active without duplicating anything", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    await caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "first",
    });

    // The lost-response idempotency contract: a retry hits this clean conflict,
    // then the client rehydrates and finds the committed run plus its message.
    await expect(
      caller.startRun({
        projectId,
        conversationId: conversation.id,
        message: "first",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(
      await prisma.inAppAgentRun.count({
        where: { projectId, conversationId: conversation.id },
      }),
    ).toBe(1);
    expect(
      await prisma.inAppAgentEvent.count({
        where: { projectId, conversationId: conversation.id },
      }),
    ).toBe(1);
  });

  it("supersedes a pending approval when a new message is submitted", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const parkedRunId = await parkRunForApproval({
      projectId,
      conversationId: conversation.id,
      userId,
      toolCallId: "tool-call-1",
    });

    const { runId } = await caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "never mind, do this instead",
    });

    const parkedRun = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: parkedRunId, projectId },
    });

    expect(parkedRun.status).toBe(InAppAgentRunStatus.CANCELLED);
    expect(parkedRun.errorCode).toBe(
      InAppAgentRunErrorCode.APPROVAL_SUPERSEDED,
    );
    expect(runId).not.toBe(parkedRunId);
  });

  it("decides an approval exactly once and reads the tool args server-side", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const parkedRunId = await parkRunForApproval({
      projectId,
      conversationId: conversation.id,
      userId,
      toolCallId: "tool-call-1",
    });

    const { runId: continuationRunId } = await caller.decideToolApproval({
      projectId,
      conversationId: conversation.id,
      runId: parkedRunId,
      toolCallId: "tool-call-1",
      approved: true,
    });

    const parkedRun = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: parkedRunId, projectId },
    });
    // A parent that parked and was decided completed its job; the handoff is
    // the success.
    expect(parkedRun.status).toBe(InAppAgentRunStatus.SUCCEEDED);

    const continuation = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: continuationRunId, projectId },
    });
    expect(continuation.status).toBe(InAppAgentRunStatus.QUEUED);
    expect(continuation.request).toMatchObject({
      kind: "approvalDecision",
      parentRunId: parkedRunId,
      toolCallId: "tool-call-1",
      approved: true,
    });

    const decisionEvent = await prisma.inAppAgentEvent.findFirstOrThrow({
      where: { projectId, conversationId: conversation.id, runId: parkedRunId },
      orderBy: { sequenceNumber: "desc" },
    });
    expect(decisionEvent.event).toMatchObject({
      name: IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME,
      value: {
        toolCallId: "tool-call-1",
        approved: true,
        decidedByUserId: userId,
      },
    });

    await expect(
      caller.decideToolApproval({
        projectId,
        conversationId: conversation.id,
        runId: parkedRunId,
        toolCallId: "tool-call-1",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(
      await prisma.inAppAgentRun.count({
        where: {
          projectId,
          conversationId: conversation.id,
          status: InAppAgentRunStatus.QUEUED,
        },
      }),
    ).toBe(1);
  });

  it("persists approval expiry before rejecting a late decision", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const parkedRunId = await parkRunForApproval({
      projectId,
      conversationId: conversation.id,
      userId,
      toolCallId: "expired-tool-call",
    });
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: parkedRunId, projectId } },
      data: { finishedAt: new Date(Date.now() - 25 * 60 * 60_000) },
    });

    await expect(
      caller.decideToolApproval({
        projectId,
        conversationId: conversation.id,
        runId: parkedRunId,
        toolCallId: "expired-tool-call",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      prisma.inAppAgentRun.findFirstOrThrow({
        where: { id: parkedRunId, projectId },
      }),
    ).resolves.toMatchObject({
      status: InAppAgentRunStatus.FAILED,
      errorCode: InAppAgentRunErrorCode.APPROVAL_EXPIRED,
    });
  });

  it("cancels a queued run immediately and a pending approval directly", async () => {
    const { caller, projectId, userId } = await createCaller();

    const queuedConversation = await createConversation({ projectId, userId });
    const { runId: queuedRunId } = await caller.startRun({
      projectId,
      conversationId: queuedConversation.id,
      message: "stop me",
    });

    const queuedResult = await caller.cancelRun({
      projectId,
      conversationId: queuedConversation.id,
      runId: queuedRunId,
    });

    expect(queuedResult.cancelledImmediately).toBe(true);
    const cancelledQueuedRun = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: queuedRunId, projectId },
    });
    expect(cancelledQueuedRun.status).toBe(InAppAgentRunStatus.CANCELLED);
    expect(cancelledQueuedRun.errorCode).toBe(InAppAgentRunErrorCode.CANCELLED);
    expect(cancelledQueuedRun.cancelRequestedAt).not.toBeNull();

    const parkedConversation = await createConversation({ projectId, userId });
    const parkedRunId = await parkRunForApproval({
      projectId,
      conversationId: parkedConversation.id,
      userId,
      toolCallId: "tool-call-2",
    });

    await caller.cancelRun({
      projectId,
      conversationId: parkedConversation.id,
      runId: parkedRunId,
    });

    const cancelledParkedRun = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: parkedRunId, projectId },
    });
    expect(cancelledParkedRun.status).toBe(InAppAgentRunStatus.CANCELLED);
    expect(cancelledParkedRun.errorCode).toBe(
      InAppAgentRunErrorCode.APPROVAL_CANCELLED,
    );

    // Cancel writes no decision event, so the card can only stop being
    // actionable by deriving from the parked run's status.
    const afterCancel = await caller.getConversation({
      projectId,
      conversationId: parkedConversation.id,
    });
    expect(afterCancel.pendingToolApprovals).toEqual([]);

    const terminalConversation = await createConversation({
      projectId,
      userId,
    });
    const terminalRunId = createInAppAgentRunId();
    await prisma.inAppAgentRun.create({
      data: {
        id: terminalRunId,
        projectId,
        conversationId: terminalConversation.id,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.SUCCEEDED,
        finishedAt: new Date(),
        request: { kind: "userMessage", context: [] },
      },
    });

    await caller.cancelRun({
      projectId,
      conversationId: terminalConversation.id,
      runId: terminalRunId,
    });

    await expect(
      prisma.inAppAgentRun.findFirstOrThrow({
        where: { id: terminalRunId, projectId },
      }),
    ).resolves.toMatchObject({
      status: InAppAgentRunStatus.SUCCEEDED,
      cancelRequestedAt: null,
    });
  });

  it("stops surfacing an approval that a newer message superseded", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    await parkRunForApproval({
      projectId,
      conversationId: conversation.id,
      userId,
      toolCallId: "tool-call-3",
    });

    const beforeSupersede = await caller.getConversation({
      projectId,
      conversationId: conversation.id,
    });
    expect(beforeSupersede.pendingToolApprovals).toHaveLength(1);

    await caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "never mind",
    });

    // Supersede also writes no decision event; the interrupt event is still
    // there, so only the parent's status can retire the card.
    const afterSupersede = await caller.getConversation({
      projectId,
      conversationId: conversation.id,
    });
    expect(afterSupersede.pendingToolApprovals).toEqual([]);
  });

  it("reconciles dead runs on read with the right typed error code", async () => {
    const { caller, projectId, userId } = await createCaller();

    const cases = [
      {
        name: "worker_lost",
        expected: InAppAgentRunErrorCode.WORKER_LOST,
        data: {
          status: InAppAgentRunStatus.RUNNING,
          claimedAt: new Date(Date.now() - 120_000),
          heartbeatAt: new Date(Date.now() - 90_000),
        },
      },
      {
        name: "run_timeout",
        expected: InAppAgentRunErrorCode.RUN_TIMEOUT,
        data: {
          status: InAppAgentRunStatus.RUNNING,
          claimedAt: new Date(Date.now() - 16 * 60_000),
          // A hung tool keeps the heartbeat healthy; the duration backstop is
          // what has to fire here.
          heartbeatAt: new Date(),
        },
      },
      {
        name: "queue_timeout",
        expected: InAppAgentRunErrorCode.QUEUE_TIMEOUT,
        data: { status: InAppAgentRunStatus.QUEUED },
        createdAt: new Date(Date.now() - 6 * 60_000),
      },
      {
        name: "approval_expired",
        expected: InAppAgentRunErrorCode.APPROVAL_EXPIRED,
        data: {
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
          finishedAt: new Date(Date.now() - 25 * 60 * 60_000),
        },
      },
    ];

    for (const testCase of cases) {
      const conversation = await createConversation({ projectId, userId });
      const runId = createInAppAgentRunId();

      await prisma.inAppAgentRun.create({
        data: {
          id: runId,
          projectId,
          conversationId: conversation.id,
          triggeredByUserId: userId,
          request: { kind: "userMessage", context: [] },
          ...testCase.data,
        },
      });

      if (testCase.createdAt) {
        await prisma.inAppAgentRun.update({
          where: { id_projectId: { id: runId, projectId } },
          data: { createdAt: testCase.createdAt },
        });
      }

      const result = await caller.getConversation({
        projectId,
        conversationId: conversation.id,
      });

      expect(result.latestRun, testCase.name).toMatchObject({
        id: runId,
        status: InAppAgentRunStatus.FAILED,
        errorCode: testCase.expected,
      });
    }
  });

  it("fails the committed run when the enqueue fails", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    enqueueShouldFail = true;

    await expect(
      caller.startRun({
        projectId,
        conversationId: conversation.id,
        message: "will not reach a worker",
      }),
    ).rejects.toThrow();

    const run = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { projectId, conversationId: conversation.id },
    });

    // Never leave a committed QUEUED run that nobody will execute.
    expect(run.status).toBe(InAppAgentRunStatus.FAILED);
    expect(run.errorCode).toBe(InAppAgentRunErrorCode.ENQUEUE_FAILED);
    expect(run.finishedAt).not.toBeNull();
  });

  it("denies every background mutation to a non-owner", async () => {
    const owner = await createCaller();
    const conversation = await createConversation({
      projectId: owner.projectId,
      userId: owner.userId,
    });
    const { runId } = await owner.caller.startRun({
      projectId: owner.projectId,
      conversationId: conversation.id,
      message: "mine",
    });

    const intruderId = `user-${randomUUID()}`;
    await prisma.user.create({
      data: { id: intruderId, email: `${intruderId}@example.com` },
    });

    const intruderSession: Session = {
      expires: "1",
      user: {
        id: intruderId,
        name: "Intruder",
        canCreateOrganizations: true,
        organizations: [
          {
            id: owner.orgId,
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            name: "Test Organization",
            metadata: {},
            aiFeaturesEnabled: true,
            aiTelemetryEnabled: false,
            projects: [
              {
                id: owner.projectId,
                role: "ADMIN",
                name: "Test Project",
                deletedAt: null,
                retentionDays: null,
                hasTraces: false,
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
        featureFlags: {} as Flags,
        admin: false,
      },
      environment: {} as any,
    };

    const intruder = inAppAgentRouter.createCaller({
      ...createInnerTRPCContext({ session: intruderSession, headers: {} }),
      prisma,
    });

    // Project membership is not enough: conversations are owner-only in v1.
    await expect(
      intruder.startRun({
        projectId: owner.projectId,
        conversationId: conversation.id,
        message: "not mine",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      intruder.cancelRun({
        projectId: owner.projectId,
        conversationId: conversation.id,
        runId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      intruder.decideToolApproval({
        projectId: owner.projectId,
        conversationId: conversation.id,
        runId,
        toolCallId: "tool-call-1",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("denies every background mutation when organization AI features are disabled", async () => {
    const { caller, orgId, projectId } = await createCaller();

    await prisma.organization.update({
      where: { id: orgId },
      data: { aiFeaturesEnabled: false },
    });

    await expect(
      caller.startRun({
        projectId,
        conversationId: createInAppAgentConversationId(),
        message: "do not enqueue",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.cancelRun({
        projectId,
        conversationId: createInAppAgentConversationId(),
        runId: createInAppAgentRunId(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.decideToolApproval({
        projectId,
        conversationId: createInAppAgentConversationId(),
        runId: createInAppAgentRunId(),
        toolCallId: "tool-call-disabled",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(enqueuedJobs).toHaveLength(0);
  });
});
