/**
 * Claim, fire, and skip contracts for scheduled in-app agent routines.
 * These go through the tRPC surface plus the shared claim/fire helpers
 * the worker runner uses, so a missed tick and a skip share one path.
 */
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@langfuse/shared";
import { InAppAgentRoutineStatus, prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  InAppAgentRoutineSkipReason,
  InAppAgentRunStatus,
} from "@langfuse/shared/in-app-agent";
import {
  claimDueInAppAgentRoutine,
  fireInAppAgentRoutine,
} from "@langfuse/shared/in-app-agent/server/routineFire";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { QueueJobs } from "@langfuse/shared/src/server";
import { createInAppAgentConversationId } from "@/src/features/in-app-agent/ids";
import { env } from "@/src/env.mjs";
import { inAppAgentRouter } from "@/src/features/in-app-agent/server/router";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

import type * as SharedServerModule from "@langfuse/shared/src/server";

const enqueuedJobs: Array<{ name: string; payload: unknown; jobId?: string }> =
  [];

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual<typeof SharedServerModule>(
    "@langfuse/shared/src/server",
  );

  return {
    ...actual,
    InAppAgentRunQueue: {
      getInstance: () => ({
        add: (name: string, payload: unknown, options?: { jobId?: string }) => {
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

describe("in-app agent routines", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalSharedCloudRegion = sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalSharedModel = sharedEnv.LANGFUSE_AI_MODEL;
  const originalSharedSmallModel = sharedEnv.LANGFUSE_AI_SMALL_MODEL;
  const originalSharedProvider = sharedEnv.LANGFUSE_AI_PROVIDER;
  const originalSharedApiKey = sharedEnv.LANGFUSE_AI_API_KEY;
  const originalSharedRegion = sharedEnv.LANGFUSE_AI_AWS_BEDROCK_REGION;
  const originalSharedInAppAgentEnabled =
    sharedEnv.LANGFUSE_IN_APP_AGENT_ENABLED;
  const originalCapacityPerUser =
    process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER;

  beforeEach(() => {
    (
      env as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
    ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (
      sharedEnv as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
    ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (sharedEnv as { LANGFUSE_AI_PROVIDER?: string }).LANGFUSE_AI_PROVIDER =
      "bedrock";
    (sharedEnv as { LANGFUSE_AI_API_KEY?: string }).LANGFUSE_AI_API_KEY =
      undefined;
    (sharedEnv as { LANGFUSE_AI_MODEL?: string }).LANGFUSE_AI_MODEL =
      "test-model";
    (
      sharedEnv as { LANGFUSE_AI_SMALL_MODEL?: string }
    ).LANGFUSE_AI_SMALL_MODEL = undefined;
    (
      sharedEnv as { LANGFUSE_AI_AWS_BEDROCK_REGION?: string }
    ).LANGFUSE_AI_AWS_BEDROCK_REGION = "eu-central-1";
    (
      sharedEnv as { LANGFUSE_IN_APP_AGENT_ENABLED?: string }
    ).LANGFUSE_IN_APP_AGENT_ENABLED = undefined;
    delete process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER;
    enqueuedJobs.length = 0;
  });

  afterEach(() => {
    (
      env as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
    ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (
      sharedEnv as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
    ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalSharedCloudRegion;
    (sharedEnv as { LANGFUSE_AI_MODEL?: string }).LANGFUSE_AI_MODEL =
      originalSharedModel;
    (
      sharedEnv as { LANGFUSE_AI_SMALL_MODEL?: string }
    ).LANGFUSE_AI_SMALL_MODEL = originalSharedSmallModel;
    (sharedEnv as { LANGFUSE_AI_PROVIDER?: string }).LANGFUSE_AI_PROVIDER =
      originalSharedProvider;
    (sharedEnv as { LANGFUSE_AI_API_KEY?: string }).LANGFUSE_AI_API_KEY =
      originalSharedApiKey;
    (
      sharedEnv as { LANGFUSE_AI_AWS_BEDROCK_REGION?: string }
    ).LANGFUSE_AI_AWS_BEDROCK_REGION = originalSharedRegion;
    (
      sharedEnv as { LANGFUSE_IN_APP_AGENT_ENABLED?: string }
    ).LANGFUSE_IN_APP_AGENT_ENABLED = originalSharedInAppAgentEnabled;
    if (originalCapacityPerUser === undefined) {
      delete process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER;
    } else {
      process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER =
        originalCapacityPerUser;
    }
  });

  const createCaller = async (userId = `user-${randomUUID()}`) => {
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
            plan: "cloud:hobby",
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
        featureFlags: testFeatureFlags({ templateFlag: false }),
        admin: false,
      },
      environment: {} as never,
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });

    return {
      ...setup,
      userId,
      caller: inAppAgentRouter.createCaller({ ...ctx, prisma }),
    };
  };

  const grantProjectAccess = async (params: {
    orgId: string;
    userId: string;
  }) => {
    await prisma.organizationMembership.create({
      data: {
        userId: params.userId,
        orgId: params.orgId,
        role: Role.OWNER,
      },
    });
  };

  const createDueRoutine = async (params: {
    projectId: string;
    userId: string;
    name?: string;
  }) => {
    const dueNextRunAt = new Date("2026-03-27T08:00:00.000Z");

    return prisma.inAppAgentRoutine.create({
      data: {
        id: `artn_${randomUUID().replaceAll("-", "")}`,
        projectId: params.projectId,
        createdByUserId: params.userId,
        name: params.name ?? "Daily digest",
        prompt: "Summarize yesterday's traces and suggest improvements.",
        cron: "0 9 * * *",
        timezone: "Europe/Berlin",
        status: InAppAgentRoutineStatus.ACTIVE,
        nextRunAt: dueNextRunAt,
      },
    });
  };

  const claimAndFire = async (params: {
    routine: Awaited<ReturnType<typeof createDueRoutine>>;
    now?: Date;
  }) => {
    const now = params.now ?? new Date("2026-03-27T08:00:01.000Z");
    const claimed = await claimDueInAppAgentRoutine({
      prisma,
      projectId: params.routine.projectId,
      routineId: params.routine.id,
      dueNextRunAt: params.routine.nextRunAt,
      cron: params.routine.cron,
      timezone: params.routine.timezone,
      now,
    });

    const result = claimed
      ? await fireInAppAgentRoutine({
          prisma,
          routine: params.routine,
          now,
        })
      : null;

    return { claimed, result };
  };

  it("claims a due routine once, fires a new owner-scoped conversation, and skips the second tick", async () => {
    const { orgId, projectId, userId } = await createCaller();
    await grantProjectAccess({ orgId, userId });
    const routine = await createDueRoutine({
      projectId,
      userId,
      name: "Trace digest",
    });

    const first = await claimAndFire({ routine });

    expect(first.claimed?.nextRunAt.toISOString()).toBe(
      "2026-03-28T08:00:00.000Z",
    );
    expect(first.result).toMatchObject({ status: "fired" });
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]?.name).toBe(QueueJobs.InAppAgentRunJob);
    expect(enqueuedJobs[0]?.jobId).toBe(
      first.result?.status === "fired" ? first.result.runId : undefined,
    );

    const conversation = await prisma.inAppAgentConversation.findFirstOrThrow({
      where: {
        projectId,
        id:
          first.result?.status === "fired"
            ? first.result.conversationId
            : "missing",
      },
    });

    expect(conversation).toMatchObject({
      createdByUserId: userId,
      routineId: routine.id,
      title: "Trace digest · Mar 27, 2026",
    });

    const second = await claimAndFire({ routine });

    expect(second.claimed).toBeNull();
    expect(second.result).toBeNull();
    expect(enqueuedJobs).toHaveLength(1);

    const persisted = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: {
        id_projectId: { id: routine.id, projectId },
      },
    });

    expect(persisted.nextRunAt.toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(persisted.lastSkipReason).toBeNull();
    expect(persisted.lastConversationId).toBe(conversation.id);
  });

  it("records a membership skip after advancing nextRunAt", async () => {
    const { projectId, userId } = await createCaller();
    const routine = await createDueRoutine({ projectId, userId });

    const { claimed, result } = await claimAndFire({ routine });

    expect(claimed).not.toBeNull();
    expect(result).toEqual({
      status: "skipped",
      reason: InAppAgentRoutineSkipReason.MEMBERSHIP_LOST,
    });
    expect(enqueuedJobs).toHaveLength(0);

    const persisted = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: {
        id_projectId: { id: routine.id, projectId },
      },
    });

    expect(persisted.nextRunAt.toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(persisted.lastSkipReason).toBe(
      InAppAgentRoutineSkipReason.MEMBERSHIP_LOST,
    );
    expect(persisted.lastConversationId).toBeNull();
  });

  it("records a capacity skip after advancing nextRunAt", async () => {
    const { orgId, projectId, userId } = await createCaller();
    await grantProjectAccess({ orgId, userId });
    process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER = "1";

    const blockingConversation = await prisma.inAppAgentConversation.create({
      data: {
        id: createInAppAgentConversationId(),
        projectId,
        createdByUserId: userId,
      },
    });
    await prisma.inAppAgentRun.create({
      data: {
        id: `arun_${randomUUID().replaceAll("-", "")}`,
        projectId,
        conversationId: blockingConversation.id,
        triggeredByUserId: userId,
        status: InAppAgentRunStatus.QUEUED,
        request: { kind: "userMessage", context: [] },
      },
    });

    const routine = await createDueRoutine({ projectId, userId });
    const { claimed, result } = await claimAndFire({ routine });

    expect(claimed).not.toBeNull();
    expect(result).toEqual({
      status: "skipped",
      reason: InAppAgentRoutineSkipReason.CAPACITY,
    });
    expect(enqueuedJobs).toHaveLength(0);

    const persisted = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: {
        id_projectId: { id: routine.id, projectId },
      },
    });

    expect(persisted.nextRunAt.toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(persisted.lastSkipReason).toBe(InAppAgentRoutineSkipReason.CAPACITY);
  });

  it("runs now without moving nextRunAt", async () => {
    const { caller, orgId, projectId, userId } = await createCaller();
    await grantProjectAccess({ orgId, userId });

    const { routine } = await caller.createRoutine({
      projectId,
      name: "On demand",
      prompt: "Summarize the last hour.",
      cron: "0 9 * * *",
      timezone: "Europe/Berlin",
    });
    const nextRunAtBefore = routine.nextRunAt;

    expect(routine.status).toBe(InAppAgentRoutineStatus.PAUSED);

    const result = await caller.runRoutineNow({
      projectId,
      routineId: routine.id,
    });

    expect(result).toMatchObject({ status: "fired" });
    expect(enqueuedJobs).toHaveLength(1);

    const persisted = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: {
        id_projectId: { id: routine.id, projectId },
      },
    });

    expect(persisted.nextRunAt).toEqual(nextRunAtBefore);
  });
});
