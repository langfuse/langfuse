import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("in-app agent router", () => {
  it("soft-deletes an owned conversation", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({
      projectId,
      userId,
      providerSessionId: "session-1",
    });

    await caller.inAppAgent.deleteConversation({
      projectId,
      conversationId: conversation.id,
    });

    const deletedConversation =
      await prisma.inAppAgentConversation.findUniqueOrThrow({
        where: {
          id_projectId: {
            id: conversation.id,
            projectId,
          },
        },
      });

    expect(deletedConversation.deletedAt).toBeInstanceOf(Date);
    expect(deletedConversation.providerSessionId).toBeNull();
  });

  it("excludes deleted conversations from list and get", async () => {
    const { caller, projectId, userId } = await createCaller();
    const keptConversation = await createConversation({
      projectId,
      userId,
      title: "Kept conversation",
    });
    const deletedConversation = await createConversation({
      projectId,
      userId,
      title: "Deleted conversation",
    });

    await caller.inAppAgent.deleteConversation({
      projectId,
      conversationId: deletedConversation.id,
    });

    const listedConversations = await caller.inAppAgent.listConversations({
      projectId,
    });

    expect(listedConversations.conversations.map(({ id }) => id)).toContain(
      keptConversation.id,
    );
    expect(listedConversations.conversations.map(({ id }) => id)).not.toContain(
      deletedConversation.id,
    );
    await expect(
      caller.inAppAgent.getConversation({
        projectId,
        conversationId: deletedConversation.id,
      }),
    ).rejects.toThrow("Agent conversation not found");
  });

  it("does not delete another user's conversation", async () => {
    const fixture = await createProjectFixture();
    const ownerCaller = createCallerForFixture(fixture, fixture.ownerUserId);
    const otherCaller = createCallerForFixture(fixture, fixture.otherUserId);
    const conversation = await createConversation({
      projectId: fixture.projectId,
      userId: fixture.ownerUserId,
    });

    await expect(
      otherCaller.inAppAgent.deleteConversation({
        projectId: fixture.projectId,
        conversationId: conversation.id,
      }),
    ).rejects.toThrow("Agent conversation not found");

    await ownerCaller.inAppAgent.getConversation({
      projectId: fixture.projectId,
      conversationId: conversation.id,
    });
  });

  it("exposes the telemetry project only to internal users with project access", async () => {
    const fixture = await createProjectFixture();
    const telemetryFixture = await createProjectFixture();
    const staffCaller = createCallerForFixture(fixture, fixture.ownerUserId, {
      email: "member@clickhouse.com",
    });
    const memberCaller = createCallerForFixture(fixture, fixture.ownerUserId, {
      email: "member@clickhouse.com",
      additionalFixture: telemetryFixture,
    });
    const adminCaller = createCallerForFixture(fixture, fixture.ownerUserId, {
      admin: true,
    });
    const externalCaller = createCallerForFixture(fixture, fixture.ownerUserId);
    const originalAiFeaturesProjectId = env.LANGFUSE_AI_FEATURES_PROJECT_ID;
    const originalExperimentalFeatures =
      env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;

    try {
      Object.assign(env, { LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: "false" });
      (
        env as { LANGFUSE_AI_FEATURES_PROJECT_ID?: string }
      ).LANGFUSE_AI_FEATURES_PROJECT_ID = telemetryFixture.projectId;

      await expect(
        externalCaller.inAppAgent.telemetryProject({
          projectId: fixture.projectId,
        }),
      ).rejects.toThrow("internal surface");
      await expect(
        staffCaller.inAppAgent.telemetryProject({
          projectId: fixture.projectId,
        }),
      ).resolves.toEqual({ projectId: null });
      for (const caller of [memberCaller, adminCaller]) {
        await expect(
          caller.inAppAgent.telemetryProject({
            projectId: fixture.projectId,
          }),
        ).resolves.toEqual({ projectId: telemetryFixture.projectId });
      }

      await prisma.organization.update({
        where: { id: fixture.orgId },
        data: { aiTelemetryEnabled: false },
      });
      for (const caller of [memberCaller, adminCaller]) {
        await expect(
          caller.inAppAgent.telemetryProject({
            projectId: fixture.projectId,
          }),
        ).resolves.toEqual({ projectId: null });
      }

      await prisma.organization.update({
        where: { id: fixture.orgId },
        data: { aiTelemetryEnabled: true },
      });
      (
        env as { LANGFUSE_AI_FEATURES_PROJECT_ID?: string }
      ).LANGFUSE_AI_FEATURES_PROJECT_ID = undefined;
      await expect(
        memberCaller.inAppAgent.telemetryProject({
          projectId: fixture.projectId,
        }),
      ).resolves.toEqual({ projectId: null });
    } finally {
      Object.assign(env, {
        LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: originalExperimentalFeatures,
      });
      (
        env as { LANGFUSE_AI_FEATURES_PROJECT_ID?: string }
      ).LANGFUSE_AI_FEATURES_PROJECT_ID = originalAiFeaturesProjectId;
    }
  });
});

async function createCaller() {
  const fixture = await createProjectFixture();

  return {
    ...fixture,
    userId: fixture.ownerUserId,
    caller: createCallerForFixture(fixture, fixture.ownerUserId),
  };
}

async function createProjectFixture() {
  const id = randomUUID();
  const orgId = `org-${id}`;
  const projectId = `project-${id}`;
  const ownerUserId = `owner-${id}`;
  const otherUserId = `other-${id}`;

  const org = await prisma.organization.create({
    data: {
      id: orgId,
      name: `In-app Agent Router Test Org ${id}`,
      aiFeaturesEnabled: true,
    },
  });
  const project = await prisma.project.create({
    data: {
      id: projectId,
      orgId,
      name: `In-app Agent Router Test Project ${id}`,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        id: ownerUserId,
        email: `${ownerUserId}@example.com`,
        name: "In-app Agent Router Test Owner",
      },
      {
        id: otherUserId,
        email: `${otherUserId}@example.com`,
        name: "In-app Agent Router Test Other User",
      },
    ],
  });

  return {
    orgId: org.id,
    orgName: org.name,
    projectId: project.id,
    projectName: project.name,
    ownerUserId,
    otherUserId,
  };
}

function createCallerForFixture(
  fixture: Awaited<ReturnType<typeof createProjectFixture>>,
  userId: string,
  {
    email = `${userId}@example.com`,
    admin = false,
    additionalFixture,
  }: {
    email?: string;
    admin?: boolean;
    additionalFixture?: Awaited<ReturnType<typeof createProjectFixture>>;
  } = {},
) {
  const session: Session = {
    expires: "1",
    user: {
      id: userId,
      email,
      name: "In-app Agent Router Test User",
      canCreateOrganizations: true,
      organizations: [
        fixture,
        ...(additionalFixture ? [additionalFixture] : []),
      ].map((projectFixture) => ({
        id: projectFixture.orgId,
        name: projectFixture.orgName,
        role: projectFixture === fixture ? "OWNER" : "VIEWER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: true,
        aiTelemetryEnabled: true,
        projects: [
          {
            id: projectFixture.projectId,
            name: projectFixture.projectName,
            role: projectFixture === fixture ? "ADMIN" : "VIEWER",
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
      })),
      featureFlags: testFeatureFlags(),
      admin,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:enterprise",
    },
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });

  return appRouter.createCaller({ ...ctx, prisma });
}

async function createConversation({
  projectId,
  userId,
  title = "Test conversation",
  providerSessionId,
}: {
  projectId: string;
  userId: string;
  title?: string;
  providerSessionId?: string;
}) {
  return prisma.inAppAgentConversation.create({
    data: {
      id: `conv-${randomUUID()}`,
      projectId,
      createdByUserId: userId,
      title,
      providerSessionId,
    },
  });
}
