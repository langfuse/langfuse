import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Role } from "@langfuse/shared";
import { InAppAgentRoutineStatus, prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createAndTestInAppAgentRoutine,
  createInAppAgentRoutine,
} from "@langfuse/shared/in-app-agent/server/routineWrite";

describe("create and test in-app agent routines", () => {
  const originalProvider = sharedEnv.LANGFUSE_AI_PROVIDER;
  const originalModel = sharedEnv.LANGFUSE_AI_MODEL;
  const originalRegion = sharedEnv.LANGFUSE_AI_AWS_BEDROCK_REGION;
  const originalApiKey = sharedEnv.LANGFUSE_AI_API_KEY;

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
        email: `routine-write-${randomUUID()}@example.com`,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        orgId: setup.orgId,
        role: Role.OWNER,
      },
    });
    return { ...setup, userId: user.id };
  };

  it("creates a disabled routine and fires a test conversation", async () => {
    const { projectId, userId } = await setupProject();

    const result = await createAndTestInAppAgentRoutine({
      prisma,
      projectId,
      userId,
      name: "Trace digest",
      prompt: "Summarize yesterday's traces.",
      cron: "0 9 * * *",
      timezone: "Europe/Berlin",
    });

    expect(result).toMatchObject({
      type: "createAndTestRoutine",
      enabled: false,
      test: { status: "fired" },
    });

    const routine = await prisma.inAppAgentRoutine.findUniqueOrThrow({
      where: {
        id_projectId: { id: result.routineId, projectId },
      },
    });
    expect(routine.status).toBe(InAppAgentRoutineStatus.PAUSED);
    expect(routine.lastConversationId).toBe(
      result.test.status === "fired" ? result.test.conversationId : undefined,
    );
  });

  it("creates an enabled routine when asked", async () => {
    const { projectId, userId } = await setupProject();

    const routine = await createInAppAgentRoutine({
      prisma,
      projectId,
      userId,
      name: "Enabled digest",
      prompt: "Summarize the last hour.",
      cron: "0 9 * * *",
      timezone: "Europe/Berlin",
      enabled: true,
    });

    expect(routine.status).toBe(InAppAgentRoutineStatus.ACTIVE);
  });
});
