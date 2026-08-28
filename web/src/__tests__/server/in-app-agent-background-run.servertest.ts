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

import { type Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE } from "@langfuse/shared/in-app-agent/server/modelProvider";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME,
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
} from "@langfuse/shared/in-app-agent";
import {
  createInAppAgentConversationId,
  createInAppAgentRunId,
} from "@/src/features/in-app-agent/ids";
import { ensureOwnedConversation } from "@langfuse/shared/in-app-agent/server/persistence";
import {
  IN_APP_AGENT_HEARTBEAT_STALE_MS,
  IN_APP_AGENT_QUEUE_TIMEOUT_MS,
  IN_APP_AGENT_RUN_MAX_DURATION_MS,
} from "@langfuse/shared/in-app-agent/server/tunables";
import { env } from "@/src/env.mjs";
import { inAppAgentRouter } from "@/src/features/in-app-agent/server/router";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

import type * as SharedServerModule from "@langfuse/shared/src/server";
import type * as PersistenceModule from "@langfuse/shared/in-app-agent/server/persistence";

const enqueuedJobs: Array<{ name: string; payload: unknown; jobId?: string }> =
  [];
let enqueueShouldFail = false;

const rateLimitMocks = vi.hoisted(() => ({
  rateLimitRequest: vi.fn(),
}));

const persistenceMocks = vi.hoisted(() => ({
  maybeInferAndPersistConversationTitle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@langfuse/shared/in-app-agent/server/persistence", async () => {
  const actual = await vi.importActual<typeof PersistenceModule>(
    "@langfuse/shared/in-app-agent/server/persistence",
  );

  return {
    ...actual,
    maybeInferAndPersistConversationTitle:
      persistenceMocks.maybeInferAndPersistConversationTitle,
  };
});

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

vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: rateLimitMocks.rateLimitRequest,
    }),
  },
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

describe("in-app agent background runs", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalModel = env.LANGFUSE_AI_MODEL;
  const originalSharedCloudRegion = sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalSharedModel = sharedEnv.LANGFUSE_AI_MODEL;
  const originalSharedSmallModel = sharedEnv.LANGFUSE_AI_SMALL_MODEL;
  const originalSharedProvider = sharedEnv.LANGFUSE_AI_PROVIDER;
  const originalSharedApiKey = sharedEnv.LANGFUSE_AI_API_KEY;
  const originalSharedRegion = sharedEnv.LANGFUSE_AI_AWS_BEDROCK_REGION;
  const originalSharedInAppAgentEnabled =
    sharedEnv.LANGFUSE_IN_APP_AGENT_ENABLED;
  const originalMaxActiveRunsPerUser =
    env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER;
  const originalMaxActiveRunsPerOrg =
    env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_ORG;

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (env as any).LANGFUSE_AI_MODEL = "test-model";
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    // Pin Bedrock: a local .env with LANGFUSE_AI_PROVIDER=anthropic would
    // otherwise route these cases through the Anthropic branch.
    (sharedEnv as any).LANGFUSE_AI_PROVIDER = "bedrock";
    (sharedEnv as any).LANGFUSE_AI_API_KEY = undefined;
    (sharedEnv as any).LANGFUSE_AI_MODEL = "test-model";
    (sharedEnv as any).LANGFUSE_AI_SMALL_MODEL = undefined;
    (sharedEnv as any).LANGFUSE_AI_AWS_BEDROCK_REGION = "eu-central-1";
    (sharedEnv as any).LANGFUSE_IN_APP_AGENT_ENABLED = undefined;
    enqueuedJobs.length = 0;
    enqueueShouldFail = false;
    persistenceMocks.maybeInferAndPersistConversationTitle.mockClear();
    rateLimitMocks.rateLimitRequest.mockResolvedValue({
      isRateLimited: () => false,
      res: undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).LANGFUSE_AI_MODEL = originalModel;
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION =
      originalSharedCloudRegion;
    (sharedEnv as any).LANGFUSE_AI_MODEL = originalSharedModel;
    (sharedEnv as any).LANGFUSE_AI_SMALL_MODEL = originalSharedSmallModel;
    (sharedEnv as any).LANGFUSE_AI_PROVIDER = originalSharedProvider;
    (sharedEnv as any).LANGFUSE_AI_API_KEY = originalSharedApiKey;
    (sharedEnv as any).LANGFUSE_AI_AWS_BEDROCK_REGION = originalSharedRegion;
    (sharedEnv as any).LANGFUSE_IN_APP_AGENT_ENABLED =
      originalSharedInAppAgentEnabled;
    (env as any).LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER =
      originalMaxActiveRunsPerUser;
    (env as any).LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_ORG =
      originalMaxActiveRunsPerOrg;
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

  it.each([
    {
      name: "starts a self-hosted run when LANGFUSE_IN_APP_AGENT_ENABLED is true",
      cloudRegion: undefined,
      enabled: "true" as const,
      plan: "self-hosted:enterprise" as const,
      expected: "queued" as const,
    },
    {
      name: "rejects a self-hosted run when LANGFUSE_IN_APP_AGENT_ENABLED is unset",
      cloudRegion: undefined,
      enabled: undefined,
      plan: "self-hosted:enterprise" as const,
      expected: "rejected" as const,
    },
    {
      name: "rejects a self-hosted run when LANGFUSE_IN_APP_AGENT_ENABLED is false",
      cloudRegion: undefined,
      enabled: "false" as const,
      plan: "self-hosted:enterprise" as const,
      expected: "rejected" as const,
    },
    {
      name: "starts a Cloud run when LANGFUSE_IN_APP_AGENT_ENABLED is unset",
      cloudRegion: "DEV" as const,
      enabled: undefined,
      plan: "cloud:hobby" as const,
      expected: "queued" as const,
    },
    {
      name: "rejects a Cloud run when LANGFUSE_IN_APP_AGENT_ENABLED is false",
      cloudRegion: "DEV" as const,
      enabled: "false" as const,
      plan: "cloud:hobby" as const,
      expected: "rejected" as const,
    },
  ])("$name", async ({ cloudRegion, enabled, plan, expected }) => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = cloudRegion;
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = cloudRegion;
    (sharedEnv as any).LANGFUSE_IN_APP_AGENT_ENABLED = enabled;
    const { caller, projectId, userId } = await createCaller(undefined, plan);
    const conversation = await createConversation({ projectId, userId });

    const startRun = caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "Inspect a trace",
    });

    if (expected === "queued") {
      await expect(startRun).resolves.toMatchObject({
        conversationId: conversation.id,
      });
      expect(enqueuedJobs).toHaveLength(1);
      return;
    }

    await expect(startRun).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "In-app agent is not enabled on this instance.",
    });
    expect(enqueuedJobs).toHaveLength(0);
  });

  it("lists conversations when the in-app agent model is not configured", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    (sharedEnv as any).LANGFUSE_AI_MODEL = undefined;
    (sharedEnv as any).LANGFUSE_AI_AWS_BEDROCK_REGION = undefined;

    const listed = await caller.listConversations({ projectId, limit: 50 });

    expect(listed.conversations.map((item) => item.id)).toEqual([
      conversation.id,
    ]);
  });

  it("starts a Cloud run when LANGFUSE_AI_AWS_BEDROCK_REGION is unset", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    (sharedEnv as any).LANGFUSE_AI_AWS_BEDROCK_REGION = undefined;

    await expect(
      caller.startRun({
        projectId,
        conversationId: conversation.id,
        message: "Inspect a trace",
      }),
    ).resolves.toMatchObject({
      conversationId: conversation.id,
    });
    expect(enqueuedJobs).toHaveLength(1);
  });

  it("rejects requests before queueing when the in-app agent model is not configured", async () => {
    const { caller, projectId } = await createCaller();
    (sharedEnv as any).LANGFUSE_AI_MODEL = undefined;
    (sharedEnv as any).LANGFUSE_AI_AWS_BEDROCK_REGION = undefined;

    await expect(
      caller.startRun({
        projectId,
        conversationId: createInAppAgentConversationId(),
        message: "Do not queue this",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE,
    });

    expect(enqueuedJobs).toHaveLength(0);
  });

  /** Park a run for approval the way the worker does: interrupt event, then CAS. */
  const parkRunForApproval = async (params: {
    projectId: string;
    conversationId: string;
    userId: string;
    toolCallId: string;
    context?: Array<{ description: string; value: string }>;
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
        request: {
          kind: "userMessage",
          context: params.context ?? [],
        },
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

  /** An unfinished run holding a capacity slot, without going through submit. */
  const createActiveRun = async (params: {
    projectId: string;
    conversationId: string;
    userId: string;
    createdAt?: Date;
  }) =>
    prisma.inAppAgentRun.create({
      data: {
        id: createInAppAgentRunId(),
        projectId: params.projectId,
        conversationId: params.conversationId,
        triggeredByUserId: params.userId,
        status: InAppAgentRunStatus.QUEUED,
        request: { kind: "userMessage", context: [] },
        ...(params.createdAt ? { createdAt: params.createdAt } : {}),
      },
    });

  it("commits a queued run with its user message and enqueues it by run id", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    const { conversationId, runId } = await caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "why did these traces fail?",
      context: [{ description: "current_url", value: "/project/x/traces" }],
    });
    expect(conversationId).toBe(conversation.id);

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
    expect(
      persistenceMocks.maybeInferAndPersistConversationTitle,
    ).toHaveBeenCalledOnce();
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

  it("rejects a submit that exceeds the organization's active-run ceiling", async () => {
    const { caller, orgId, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    // The slot is held by a different project of the same organization: the
    // ceiling is organization-wide, so scoping the count to the submitting
    // project would silently let an organization occupy a whole region.
    const otherProject = await prisma.project.create({
      data: { orgId, name: `other-project-${randomUUID()}` },
    });
    const otherConversation = await createConversation({
      projectId: otherProject.id,
      userId,
    });
    await createActiveRun({
      projectId: otherProject.id,
      conversationId: otherConversation.id,
      userId,
    });

    (env as any).LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_ORG = 1;

    await expect(
      caller.startRun({
        projectId,
        conversationId: conversation.id,
        message: "one too many",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    // Rejected at admission: nothing committed, nothing queued.
    expect(await prisma.inAppAgentRun.count({ where: { projectId } })).toBe(0);
    expect(await prisma.inAppAgentEvent.count({ where: { projectId } })).toBe(
      0,
    );
    expect(enqueuedJobs).toEqual([]);
  });

  it("stops counting an active run that outlived its reconciliation deadline", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const abandonedConversation = await createConversation({
      projectId,
      userId,
    });

    // Conversation-scoped reconciliation only fires when that conversation is
    // read, so a leaked QUEUED row would otherwise hold a slot forever.
    await createActiveRun({
      projectId,
      conversationId: abandonedConversation.id,
      userId,
      createdAt: new Date(
        Date.now() -
          IN_APP_AGENT_QUEUE_TIMEOUT_MS -
          IN_APP_AGENT_RUN_MAX_DURATION_MS -
          60_000,
      ),
    });

    (env as any).LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER = 1;

    const { runId } = await caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "the abandoned run must not block me",
    });

    expect(
      await prisma.inAppAgentRun.findFirstOrThrow({
        where: { id: runId, projectId },
      }),
    ).toMatchObject({ status: InAppAgentRunStatus.QUEUED });
  });

  it("keeps counting an overdue run whose worker is still heartbeating", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const hungConversation = await createConversation({ projectId, userId });

    // Nothing enforces the maximum duration in-process, so a hung tool call
    // heartbeats past it and holds a real worker slot. Age alone must not free
    // its slot in the accounting, or the ceiling leaks while hung runs pile up.
    const overdue = new Date(
      Date.now() -
        IN_APP_AGENT_QUEUE_TIMEOUT_MS -
        IN_APP_AGENT_RUN_MAX_DURATION_MS -
        60_000,
    );
    await prisma.inAppAgentRun.create({
      data: {
        id: createInAppAgentRunId(),
        projectId,
        conversationId: hungConversation.id,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.RUNNING,
        request: { kind: "userMessage", context: [] },
        createdAt: overdue,
        claimedAt: overdue,
        heartbeatAt: new Date(),
      },
    });

    (env as any).LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER = 1;

    await expect(
      caller.startRun({
        projectId,
        conversationId: conversation.id,
        message: "the hung run still owns a worker",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("admits a replacement turn when the conversation's own run lost its worker", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    // Claimed recently enough to sit inside the capacity cutoff, but its
    // heartbeat is dead: reconciliation will fail it, so the ceiling must not
    // reject the replacement before that happens (a worker task rotating on
    // deploy leaves exactly this row).
    const abandonedRun = await prisma.inAppAgentRun.create({
      data: {
        id: createInAppAgentRunId(),
        projectId,
        conversationId: conversation.id,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.RUNNING,
        request: { kind: "userMessage", context: [] },
        createdAt: new Date(Date.now() - 5 * 60_000),
        claimedAt: new Date(Date.now() - 5 * 60_000),
        heartbeatAt: new Date(Date.now() - IN_APP_AGENT_HEARTBEAT_STALE_MS * 3),
      },
    });

    (env as any).LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER = 1;

    const { runId } = await caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "my run died, let me retry",
    });

    expect(
      await prisma.inAppAgentRun.findFirstOrThrow({
        where: { id: abandonedRun.id, projectId },
      }),
    ).toMatchObject({
      status: InAppAgentRunStatus.FAILED,
      errorCode: InAppAgentRunErrorCode.WORKER_LOST,
    });
    expect(
      await prisma.inAppAgentRun.findFirstOrThrow({
        where: { id: runId, projectId },
      }),
    ).toMatchObject({ status: InAppAgentRunStatus.QUEUED });
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

  it("grants a tool for the conversation only when the scope asks for it", async () => {
    const { caller, projectId, userId } = await createCaller();
    const onceConversation = await createConversation({ projectId, userId });
    const grantConversation = await createConversation({ projectId, userId });

    const onceRunId = await parkRunForApproval({
      projectId,
      conversationId: onceConversation.id,
      userId,
      toolCallId: "tool-call-once",
    });

    await caller.decideToolApproval({
      projectId,
      conversationId: onceConversation.id,
      runId: onceRunId,
      toolCallId: "tool-call-once",
      approved: true,
    });

    await expect(
      prisma.inAppAgentConversation.findFirstOrThrow({
        where: { id: onceConversation.id, projectId },
        select: { alwaysAllowedTools: true },
      }),
    ).resolves.toEqual({ alwaysAllowedTools: [] });

    const grantRunId = await parkRunForApproval({
      projectId,
      conversationId: grantConversation.id,
      userId,
      toolCallId: "tool-call-grant",
    });

    await caller.decideToolApproval({
      projectId,
      conversationId: grantConversation.id,
      runId: grantRunId,
      toolCallId: "tool-call-grant",
      approved: true,
      approvalScope: "conversation",
    });

    await expect(
      prisma.inAppAgentConversation.findFirstOrThrow({
        where: { id: grantConversation.id, projectId },
        select: { alwaysAllowedTools: true },
      }),
    ).resolves.toEqual({ alwaysAllowedTools: ["langfuse_createTextPrompt"] });

    const decisionEvent = await prisma.inAppAgentEvent.findFirstOrThrow({
      where: {
        projectId,
        conversationId: grantConversation.id,
        runId: grantRunId,
      },
      orderBy: { sequenceNumber: "desc" },
    });
    expect(decisionEvent.event).toMatchObject({
      name: IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME,
      value: {
        toolCallId: "tool-call-grant",
        approved: true,
        alwaysAllow: true,
        toolName: "langfuse_createTextPrompt",
      },
    });

    const onceDecisionEvent = await prisma.inAppAgentEvent.findFirstOrThrow({
      where: {
        projectId,
        conversationId: onceConversation.id,
        runId: onceRunId,
      },
      orderBy: { sequenceNumber: "desc" },
    });
    expect(onceDecisionEvent.event).toMatchObject({
      name: IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME,
      value: {
        toolCallId: "tool-call-once",
        approved: true,
      },
    });
    expect(onceDecisionEvent.event).not.toMatchObject({
      value: { alwaysAllow: true },
    });
  });

  it("decides an approval exactly once and reads the tool args server-side", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-14T10:01:00.000Z"));
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const context = [
      {
        description: "current_url",
        value: '{"pathname":"/project/project-1/traces"}',
      },
      { description: "user_name", value: "Agent User" },
    ];
    const parkedAt = new Date("2026-08-14T10:00:05.000Z");
    const parkedRunId = await parkRunForApproval({
      projectId,
      conversationId: conversation.id,
      userId,
      toolCallId: "tool-call-1",
      context,
      parkedAt,
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
      rootRunId: parkedRunId,
      traceStartedAt: parkedRun.createdAt.toISOString(),
      approvalRequestedAt: parkedAt.toISOString(),
      continuationNumber: 1,
      toolCallId: "tool-call-1",
      approved: true,
      context,
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

  it("preserves context through an approved then rejected chained continuation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-14T10:01:00.000Z"));
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const context = [
      {
        description: "current_url",
        value:
          '{"pathname":"/project/project-1/traces","search":"?filter=error"}',
      },
      { description: "current_timezone", value: "Europe/Berlin" },
    ];
    const initialRunId = await parkRunForApproval({
      projectId,
      conversationId: conversation.id,
      userId,
      toolCallId: "tool-call-1",
      context,
    });

    const { runId: approvedContinuationId } = await caller.decideToolApproval({
      projectId,
      conversationId: conversation.id,
      runId: initialRunId,
      toolCallId: "tool-call-1",
      approved: true,
    });

    const approvedContinuation = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: approvedContinuationId, projectId },
    });
    expect(approvedContinuation.request).toMatchObject({
      kind: "approvalDecision",
      parentRunId: initialRunId,
      rootRunId: initialRunId,
      traceStartedAt: expect.any(String),
      approvalRequestedAt: expect.any(String),
      continuationNumber: 1,
    });

    const secondParkedAt = new Date("2026-08-14T10:03:00.000Z");
    await prisma.inAppAgentRun.update({
      where: {
        id_projectId: { id: approvedContinuationId, projectId },
      },
      data: {
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
        finishedAt: secondParkedAt,
      },
    });
    await prisma.inAppAgentEvent.create({
      data: {
        projectId,
        conversationId: conversation.id,
        runId: approvedContinuationId,
        sequenceNumber: 2,
        type: EventType.CUSTOM,
        event: {
          type: EventType.CUSTOM,
          name: "on_interrupt",
          value: {
            type: "mastra_suspend",
            toolCallId: "tool-call-2",
            toolName: "langfuse_createTextPrompt",
            args: { name: "second-tool" },
            runId: approvedContinuationId,
          },
        },
      },
    });
    vi.setSystemTime(new Date("2026-08-14T10:04:00.000Z"));

    const { runId: rejectedContinuationId } = await caller.decideToolApproval({
      projectId,
      conversationId: conversation.id,
      runId: approvedContinuationId,
      toolCallId: "tool-call-2",
      approved: false,
    });

    const rejectedContinuation = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: rejectedContinuationId, projectId },
    });
    expect(rejectedContinuation.request).toMatchObject({
      kind: "approvalDecision",
      parentRunId: approvedContinuationId,
      rootRunId: initialRunId,
      traceStartedAt: (approvedContinuation.request as Record<string, unknown>)
        .traceStartedAt,
      approvalRequestedAt: secondParkedAt.toISOString(),
      continuationNumber: 2,
      toolCallId: "tool-call-2",
      approved: false,
      context,
    });
  });

  it("rate-limits approval continuations before persisting or enqueueing them", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const parkedRunId = await parkRunForApproval({
      projectId,
      conversationId: conversation.id,
      userId,
      toolCallId: "rate-limited-tool-call",
    });

    enqueuedJobs.length = 0;
    rateLimitMocks.rateLimitRequest.mockResolvedValue({
      isRateLimited: () => true,
      res: { msBeforeNext: 60_000 },
    });

    await expect(
      caller.decideToolApproval({
        projectId,
        conversationId: conversation.id,
        runId: parkedRunId,
        toolCallId: "rate-limited-tool-call",
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    await expect(
      prisma.inAppAgentRun.findFirstOrThrow({
        where: { id: parkedRunId, projectId },
      }),
    ).resolves.toMatchObject({
      status: InAppAgentRunStatus.AWAITING_APPROVAL,
    });
    expect(enqueuedJobs).toEqual([]);
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

  it("deletes a conversation while cancelling its unsettled run", async () => {
    const { caller, projectId, userId } = await createCaller();
    const runningConversation = await createConversation({ projectId, userId });
    const parkedConversation = await createConversation({ projectId, userId });

    const runningRun = await prisma.inAppAgentRun.create({
      data: {
        id: createInAppAgentRunId(),
        projectId,
        conversationId: runningConversation.id,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.RUNNING,
        claimedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
    // Parked approvals have finishedAt set but still require cancellation.
    const parkedRunId = await parkRunForApproval({
      projectId,
      conversationId: parkedConversation.id,
      userId,
      toolCallId: "tool-call-delete",
    });

    for (const conversationId of [
      runningConversation.id,
      parkedConversation.id,
    ]) {
      await caller.deleteConversation({ projectId, conversationId });
      await expect(
        prisma.inAppAgentConversation.findFirstOrThrow({
          where: { id: conversationId, projectId },
        }),
      ).resolves.toMatchObject({ deletedAt: expect.any(Date) });
    }

    await expect(
      prisma.inAppAgentRun.findFirstOrThrow({
        where: { id: parkedRunId, projectId },
      }),
    ).resolves.toMatchObject({
      status: InAppAgentRunStatus.CANCELLED,
      errorCode: InAppAgentRunErrorCode.APPROVAL_CANCELLED,
    });
    await expect(
      prisma.inAppAgentRun.findFirstOrThrow({
        where: { id: runningRun.id, projectId },
      }),
    ).resolves.toMatchObject({
      status: InAppAgentRunStatus.RUNNING,
      cancelRequestedAt: expect.any(Date),
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

  it.each([
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
  ])("reconciles $name on read with its typed error code", async (testCase) => {
    const { caller, projectId, userId } = await createCaller();
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

    expect(result.latestRun).toMatchObject({
      id: runId,
      status: InAppAgentRunStatus.FAILED,
      errorCode: testCase.expected,
    });
  });

  it("continues a conversation after a timestamp-less run times out", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const previousRunId = createInAppAgentRunId();

    await prisma.inAppAgentRun.create({
      data: {
        id: previousRunId,
        projectId,
        conversationId: conversation.id,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.RUNNING,
        request: { kind: "userMessage", context: [] },
      },
    });
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: previousRunId, projectId } },
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });

    const { runId } = await caller.startRun({
      projectId,
      conversationId: conversation.id,
      message: "continue in background",
    });

    await expect(
      prisma.inAppAgentRun.findUniqueOrThrow({
        where: { id_projectId: { id: previousRunId, projectId } },
      }),
    ).resolves.toMatchObject({
      status: InAppAgentRunStatus.FAILED,
      errorCode: InAppAgentRunErrorCode.RUN_TIMEOUT,
    });
    await expect(
      prisma.inAppAgentRun.findUniqueOrThrow({
        where: { id_projectId: { id: runId, projectId } },
      }),
    ).resolves.toMatchObject({ status: InAppAgentRunStatus.QUEUED });
    expect(enqueuedJobs).toEqual([expect.objectContaining({ jobId: runId })]);
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

  it("lists the newest run per conversation and classifies a dead worker without writing", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    await prisma.inAppAgentRun.create({
      data: {
        id: createInAppAgentRunId(),
        projectId,
        conversationId: conversation.id,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.SUCCEEDED,
        finishedAt: new Date(Date.now() - 10 * 60_000),
        createdAt: new Date(Date.now() - 10 * 60_000),
        request: { kind: "userMessage", context: [] },
      },
    });
    const deadRun = await prisma.inAppAgentRun.create({
      data: {
        id: createInAppAgentRunId(),
        projectId,
        conversationId: conversation.id,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.RUNNING,
        claimedAt: new Date(Date.now() - 5 * 60_000),
        heartbeatAt: new Date(Date.now() - 5 * 60_000),
        createdAt: new Date(Date.now() - 5 * 60_000),
        request: { kind: "userMessage", context: [] },
      },
    });

    const listed = await caller.listConversations({ projectId, limit: 50 });

    // The newest run wins, and a run whose worker stopped reporting is served
    // as failed even though nothing has written that verdict yet.
    expect(
      listed.conversations.find((row) => row.id === conversation.id)?.latestRun,
    ).toEqual({
      id: deadRun.id,
      status: InAppAgentRunStatus.FAILED,
      errorCode: InAppAgentRunErrorCode.WORKER_LOST,
      cancelRequested: false,
    });

    const stored = await prisma.inAppAgentRun.findFirstOrThrow({
      where: { id: deadRun.id, projectId },
    });
    expect(stored.status).toBe(InAppAgentRunStatus.RUNNING);
    expect(stored.finishedAt).toBeNull();
  });
});
