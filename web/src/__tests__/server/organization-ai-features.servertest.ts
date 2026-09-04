import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("organization AI feature settings", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalSharedInAppAgentEnabled =
    sharedEnv.LANGFUSE_IN_APP_AGENT_ENABLED;
  const originalAiFeaturesProjectId = sharedEnv.LANGFUSE_AI_FEATURES_PROJECT_ID;

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (sharedEnv as any).LANGFUSE_IN_APP_AGENT_ENABLED =
      originalSharedInAppAgentEnabled;
    (
      sharedEnv as { LANGFUSE_AI_FEATURES_PROJECT_ID?: string }
    ).LANGFUSE_AI_FEATURES_PROJECT_ID = originalAiFeaturesProjectId;
  });

  it("allows a self-hosted organization administrator to opt in to AI features", async () => {
    const { caller, orgId } = await createCaller();

    await caller.organizations.update({
      orgId,
      aiFeaturesEnabled: true,
    });

    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { aiFeaturesEnabled: true },
      }),
    ).resolves.toEqual({ aiFeaturesEnabled: true });
  });

  it.each([true, false])(
    "persists aiFeaturesEnabled=%s when creating an organization",
    async (aiFeaturesEnabled) => {
      const { caller } = await createCaller();

      const organization = await caller.organizations.create({
        name: `Created Organization ${randomUUID()}`,
        aiFeaturesEnabled,
      });

      await expect(
        prisma.organization.findUniqueOrThrow({
          where: { id: organization.id },
          select: { aiFeaturesEnabled: true },
        }),
      ).resolves.toEqual({ aiFeaturesEnabled });
    },
  );

  it("allows a self-hosted organization administrator to opt in to AI features when in-app agent is instance-disabled", async () => {
    (sharedEnv as any).LANGFUSE_IN_APP_AGENT_ENABLED = "false";
    const { caller, orgId } = await createCaller();

    await caller.organizations.update({
      orgId,
      aiFeaturesEnabled: true,
    });

    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { aiFeaturesEnabled: true },
      }),
    ).resolves.toEqual({ aiFeaturesEnabled: true });
  });

  it("keeps AI telemetry controls Cloud-only", async () => {
    const { caller, orgId } = await createCaller();

    await expect(
      caller.organizations.update({
        orgId,
        aiTelemetryEnabled: false,
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "AI telemetry controls are only available on Langfuse Cloud.",
    });
  });

  it("rejects AI telemetry updates when the AI-features project is not configured", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    (
      sharedEnv as { LANGFUSE_AI_FEATURES_PROJECT_ID?: string }
    ).LANGFUSE_AI_FEATURES_PROJECT_ID = undefined;

    const { caller, orgId } = await createCaller();

    await expect(
      caller.organizations.update({
        orgId,
        aiTelemetryEnabled: false,
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "AI telemetry controls are only available when the AI-features project is configured.",
    });
  });

  it("allows Cloud organizations to update AI telemetry when the AI-features project is configured", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    (
      sharedEnv as { LANGFUSE_AI_FEATURES_PROJECT_ID?: string }
    ).LANGFUSE_AI_FEATURES_PROJECT_ID = "test-ai-features-project";

    const { caller, orgId } = await createCaller();

    await caller.organizations.update({
      orgId,
      aiTelemetryEnabled: false,
    });

    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { aiTelemetryEnabled: true },
      }),
    ).resolves.toEqual({ aiTelemetryEnabled: false });
  });
});

async function createCaller() {
  const id = randomUUID();
  const orgId = `org-${id}`;
  const projectId = `project-${id}`;
  const userId = `user-${id}`;

  const organization = await prisma.organization.create({
    data: {
      id: orgId,
      name: `Organization AI Features Test ${id}`,
    },
  });
  const project = await prisma.project.create({
    data: {
      id: projectId,
      orgId,
      name: "Organization AI Features Test Project",
    },
  });
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@example.com`,
      name: "Organization AI Features Test User",
    },
  });

  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      canCreateOrganizations: true,
      organizations: [
        {
          id: organization.id,
          name: organization.name,
          role: "OWNER",
          plan: "self-hosted:enterprise",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: project.id,
              name: project.name,
              role: "ADMIN",
              deletedAt: null,
              retentionDays: null,
              hasTraces: false,
              metadata: {},
              createdAt: project.createdAt.toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        searchBar: false,
        templateFlag: false,
        excludeClickhouseRead: false,
        observationEvals: false,
        v4BetaToggleVisible: false,
        experimentsV4Enabled: false,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "self-hosted:enterprise",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });

  return {
    orgId,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}
