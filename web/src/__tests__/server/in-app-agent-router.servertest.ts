import { randomUUID } from "crypto";
import type { Session } from "next-auth";

import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("in-app agent router", () => {
  it("soft-deletes an owned conversation", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

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
) {
  const session: Session = {
    expires: "1",
    user: {
      id: userId,
      email: `${userId}@example.com`,
      name: "In-app Agent Router Test User",
      canCreateOrganizations: true,
      organizations: [
        {
          id: fixture.orgId,
          name: fixture.orgName,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: true,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: fixture.projectId,
              name: fixture.projectName,
              role: "ADMIN",
              deletedAt: null,
              retentionDays: null,
              hasTraces: false,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        searchBar: false,
        templateFlag: true,
        excludeClickhouseRead: false,
        observationEvals: false,
        v4BetaToggleVisible: false,
        experimentsV4Enabled: false,
      },
      admin: false,
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
}: {
  projectId: string;
  userId: string;
  title?: string;
}) {
  return prisma.inAppAgentConversation.create({
    data: {
      id: `conv-${randomUUID()}`,
      projectId,
      createdByUserId: userId,
      title,
    },
  });
}
