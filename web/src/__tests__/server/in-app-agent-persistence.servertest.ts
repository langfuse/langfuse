import type { Session } from "next-auth";
import { randomUUID } from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { inAppAgentRouter } from "@/src/features/in-app-agent/server/router";

describe("in-app agent persistence", () => {
  const createCaller = async (userId = `user-${randomUUID()}`) => {
    const setup = await createOrgProjectAndApiKey();

    await prisma.organization.update({
      where: { id: setup.orgId },
      data: { aiFeaturesEnabled: true },
    });

    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.com`,
      },
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
            projects: [
              {
                id: setup.projectId,
                role: "ADMIN",
                name: "Test Project",
                deletedAt: null,
                retentionDays: null,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          inAppAgent: true,
          templateFlag: true,
          excludeClickhouseRead: false,
        },
        admin: false,
      },
      environment: {} as any,
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });

    return {
      ...setup,
      userId,
      caller: inAppAgentRouter.createCaller({ ...ctx, prisma }),
      session,
    };
  };

  it("creates conversations and persists messages as separate rows", async () => {
    const { caller, projectId, userId } = await createCaller();

    const conversation = await caller.create({
      projectId,
      title: "Please inspect today's traces for outliers",
    });

    expect(conversation).not.toHaveProperty("providerSessionId");

    await prisma.inAppAgentConversation.update({
      where: { id: conversation.id, projectId },
      data: { providerSessionId: "claude-session-secret" },
    });

    await caller.syncMessages({
      projectId,
      conversationId: conversation.id,
      messages: [
        {
          id: "user-message-1",
          role: "user",
          content: "Please inspect today's traces for outliers",
        },
        {
          id: "assistant-message-1",
          role: "assistant",
          content:
            "I will inspect recent traces and look for latency outliers.",
        },
      ],
    });

    const detail = await caller.get({
      projectId,
      conversationId: conversation.id,
    });

    expect(detail.conversation).not.toHaveProperty("providerSessionId");
    expect(detail.conversation.id).toBe(conversation.id);
    expect(detail.conversation.title).toBe(
      "Please inspect today's traces for outliers",
    );
    expect(detail.state).toEqual({
      type: "existingConversation",
      projectId,
      conversationId: conversation.id,
    });
    expect(detail.messages).toEqual([
      {
        id: "user-message-1",
        role: "user",
        content: "Please inspect today's traces for outliers",
      },
      {
        id: "assistant-message-1",
        role: "assistant",
        content: "I will inspect recent traces and look for latency outliers.",
      },
    ]);

    const rows = await prisma.inAppAgentMessage.findMany({
      where: { projectId, conversationId: conversation.id },
      orderBy: { sequenceNumber: "asc" },
    });

    const listedConversations = await caller.list({ projectId });
    expect(listedConversations[0]).not.toHaveProperty("providerSessionId");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      externalId: "user-message-1",
      role: "USER",
      authorUserId: userId,
      sequenceNumber: 0,
    });
    expect(rows[1]).toMatchObject({
      externalId: "assistant-message-1",
      role: "ASSISTANT",
      authorUserId: null,
      sequenceNumber: 1,
    });

    await caller.syncMessages({
      projectId,
      conversationId: conversation.id,
      messages: [
        ...detail.messages,
        {
          id: "user-message-2",
          role: "user",
          content: "Rename this conversation",
        },
      ],
    });

    await expect(
      caller.get({
        projectId,
        conversationId: conversation.id,
      }),
    ).resolves.toMatchObject({
      conversation: {
        title: "Please inspect today's traces for outliers",
      },
    });
  });

  it("does not expose another user's conversation in the same project", async () => {
    const owner = await createCaller();
    const otherUserId = `user-${randomUUID()}`;

    await prisma.user.create({
      data: {
        id: otherUserId,
        email: `${otherUserId}@example.com`,
      },
    });

    const otherSession: Session = {
      ...owner.session,
      user: {
        ...owner.session.user!,
        id: otherUserId,
      },
    };

    const otherCtx = createInnerTRPCContext({
      session: otherSession,
      headers: {},
    });
    const otherCaller = inAppAgentRouter.createCaller({ ...otherCtx, prisma });

    const conversation = await owner.caller.create({
      projectId: owner.projectId,
      title: "Private analysis",
    });

    await expect(
      otherCaller.get({
        projectId: owner.projectId,
        conversationId: conversation.id,
      }),
    ).rejects.toThrow("Agent conversation not found");

    const visibleConversations = await otherCaller.list({
      projectId: owner.projectId,
    });

    expect(visibleConversations).toEqual([]);
  });
});
