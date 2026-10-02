import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Role } from "@langfuse/shared";
import {
  InAppAgentRoutineSkipReason,
  InAppAgentRunStatus,
} from "@langfuse/shared/in-app-agent";
import { InAppAgentRoutineStatus, prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  claimDueInAppAgentRoutine,
  fireInAppAgentRoutine,
} from "@langfuse/shared/in-app-agent/server/routineFire";

describe("in-app agent routine fire", () => {
  const originalProvider = sharedEnv.LANGFUSE_AI_PROVIDER;
  const originalModel = sharedEnv.LANGFUSE_AI_MODEL;
  const originalRegion = sharedEnv.LANGFUSE_AI_AWS_BEDROCK_REGION;
  const originalApiKey = sharedEnv.LANGFUSE_AI_API_KEY;
  const originalCapacityPerUser =
    process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER;

  beforeEach(() => {
    (sharedEnv as { LANGFUSE_AI_PROVIDER?: string }).LANGFUSE_AI_PROVIDER =
      "bedrock";
    (sharedEnv as { LANGFUSE_AI_MODEL?: string }).LANGFUSE_AI_MODEL =
      "test-model";
    (
      sharedEnv as { LANGFUSE_AI_AWS_BEDROCK_REGION?: string }
    ).LANGFUSE_AI_AWS_BEDROCK_REGION = "eu-central-1";
    (sharedEnv as { LANGFUSE_AI_API_KEY?: string }).LANGFUSE_AI_API_KEY =
      undefined;
    delete process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER;
  });

  afterEach(() => {
    (sharedEnv as { LANGFUSE_AI_PROVIDER?: string }).LANGFUSE_AI_PROVIDER =
      originalProvider;
    (sharedEnv as { LANGFUSE_AI_MODEL?: string }).LANGFUSE_AI_MODEL =
      originalModel;
    (
      sharedEnv as { LANGFUSE_AI_AWS_BEDROCK_REGION?: string }
    ).LANGFUSE_AI_AWS_BEDROCK_REGION = originalRegion;
    (sharedEnv as { LANGFUSE_AI_API_KEY?: string }).LANGFUSE_AI_API_KEY =
      originalApiKey;
    if (originalCapacityPerUser === undefined) {
      delete process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER;
    } else {
      process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER =
        originalCapacityPerUser;
    }
  });

  const setupProject = async () => {
    const setup = await createOrgProjectAndApiKey();
    await prisma.organization.update({
      where: { id: setup.orgId },
      data: { aiFeaturesEnabled: true },
    });
    const user = await prisma.user.create({
      data: {
        id: `user-${randomUUID()}`,
        email: `routine-${randomUUID()}@example.com`,
      },
    });
    return { ...setup, userId: user.id };
  };

  const grantAccess = async (params: { orgId: string; userId: string }) => {
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
  }) =>
    prisma.inAppAgentRoutine.create({
      data: {
        id: `artn_${randomUUID().replaceAll("-", "")}`,
        projectId: params.projectId,
        createdByUserId: params.userId,
        name: params.name ?? "Daily digest",
        prompt: "Summarize yesterday's traces and suggest improvements.",
        cron: "0 9 * * *",
        timezone: "Europe/Berlin",
        status: InAppAgentRoutineStatus.ACTIVE,
        nextRunAt: new Date("2026-03-27T08:00:00.000Z"),
      },
    });

  const claimAndFire = async (params: {
    routine: Awaited<ReturnType<typeof createDueRoutine>>;
  }) => {
    const now = new Date("2026-03-27T08:00:01.000Z");
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
    const { orgId, projectId, userId } = await setupProject();
    await grantAccess({ orgId, userId });
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
    const queuedRun = await prisma.inAppAgentRun.findFirstOrThrow({
      where: {
        projectId,
        conversationId: conversation.id,
      },
    });
    expect(queuedRun).toMatchObject({
      id: first.result?.status === "fired" ? first.result.runId : undefined,
      triggeredByUserId: userId,
      status: InAppAgentRunStatus.QUEUED,
    });

    const second = await claimAndFire({ routine });
    expect(second.claimed).toBeNull();
    expect(second.result).toBeNull();
    expect(
      await prisma.inAppAgentConversation.count({
        where: { projectId, routineId: routine.id },
      }),
    ).toBe(1);

    const persisted = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: { id_projectId: { id: routine.id, projectId } },
    });
    expect(persisted.nextRunAt.toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(persisted.lastSkipReason).toBeNull();
    expect(persisted.lastConversationId).toBe(conversation.id);
  });

  it("records a membership skip after advancing nextRunAt", async () => {
    const { projectId, userId } = await setupProject();
    const routine = await createDueRoutine({ projectId, userId });

    const { claimed, result } = await claimAndFire({ routine });

    expect(claimed).not.toBeNull();
    expect(result).toEqual({
      status: "skipped",
      reason: InAppAgentRoutineSkipReason.MEMBERSHIP_LOST,
    });
    const persisted = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: { id_projectId: { id: routine.id, projectId } },
    });
    expect(persisted.nextRunAt.toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(persisted.lastSkipReason).toBe(
      InAppAgentRoutineSkipReason.MEMBERSHIP_LOST,
    );
    expect(
      await prisma.inAppAgentConversation.count({
        where: { projectId, routineId: routine.id },
      }),
    ).toBe(0);
  });

  it("records a capacity skip after advancing nextRunAt", async () => {
    const { orgId, projectId, userId } = await setupProject();
    await grantAccess({ orgId, userId });
    process.env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER = "1";

    const blockingConversation = await prisma.inAppAgentConversation.create({
      data: {
        id: `aconv_${randomUUID().replaceAll("-", "")}`,
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
    const persisted = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: { id_projectId: { id: routine.id, projectId } },
    });
    expect(persisted.nextRunAt.toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(persisted.lastSkipReason).toBe(InAppAgentRoutineSkipReason.CAPACITY);
    expect(
      await prisma.inAppAgentConversation.count({
        where: { projectId, routineId: routine.id },
      }),
    ).toBe(0);
  });

  it("can fire without moving nextRunAt", async () => {
    const { orgId, projectId, userId } = await setupProject();
    await grantAccess({ orgId, userId });
    const routine = await createDueRoutine({
      projectId,
      userId,
      name: "On demand",
    });

    const result = await fireInAppAgentRoutine({ prisma, routine });

    expect(result).toMatchObject({ status: "fired" });
    expect(
      await prisma.inAppAgentRun.count({
        where: {
          projectId,
          conversationId:
            result.status === "fired" ? result.conversationId : "missing",
          status: InAppAgentRunStatus.QUEUED,
        },
      }),
    ).toBe(1);

    const persisted = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: { id_projectId: { id: routine.id, projectId } },
    });
    expect(persisted.nextRunAt.toISOString()).toBe(
      routine.nextRunAt.toISOString(),
    );
  });
});
