import type { PrismaClient } from "../db";

type SandboxConversationPrisma = Pick<PrismaClient, "inAppAgentConversation">;

type DeleteSandboxSnapshot = (params: {
  providerName?: string | null;
  snapshotKey: string;
}) => Promise<void>;

export function getInAppAgentSandboxSnapshotKey(
  projectId: string,
  conversationId: string,
) {
  return `in-app-agent-sandboxes/${projectId}/${conversationId}.snapshot`;
}

export async function clearInAppAgentConversationSandbox(params: {
  prisma: SandboxConversationPrisma;
  projectId: string;
  conversationId: string;
  deleteSnapshot: DeleteSandboxSnapshot;
}) {
  const conversation = await params.prisma.inAppAgentConversation.findUnique({
    where: {
      id_projectId: {
        id: params.conversationId,
        projectId: params.projectId,
      },
    },
    select: {
      id: true,
      projectId: true,
      providerSessionId: true,
      sandboxSnapshotKey: true,
      sandboxExpiresAt: true,
      sandboxProvider: true,
    },
  });

  if (!conversation) {
    return;
  }

  if (
    conversation.providerSessionId ||
    conversation.sandboxSnapshotKey ||
    conversation.sandboxExpiresAt ||
    conversation.sandboxProvider
  ) {
    await params.deleteSnapshot({
      providerName: conversation.sandboxProvider,
      snapshotKey:
        conversation.sandboxSnapshotKey ??
        getInAppAgentSandboxSnapshotKey(conversation.projectId, conversation.id),
    });
  }

  await params.prisma.inAppAgentConversation.update({
    where: {
      id_projectId: {
        id: params.conversationId,
        projectId: params.projectId,
      },
    },
    data: {
      providerSessionId: null,
      sandboxSnapshotKey: null,
      sandboxExpiresAt: null,
      sandboxProvider: null,
    },
  });
}

export async function clearExpiredInAppAgentProjectSandboxes(params: {
  prisma: SandboxConversationPrisma;
  projectId: string;
  cutoffDate?: Date;
  deleteSnapshot: DeleteSandboxSnapshot;
}) {
  const conversations = await params.prisma.inAppAgentConversation.findMany({
    where: {
      projectId: params.projectId,
      AND: [
        {
          OR: [
            { providerSessionId: { not: null } },
            { sandboxSnapshotKey: { not: null } },
            { sandboxExpiresAt: { not: null } },
            { sandboxProvider: { not: null } },
          ],
        },
        {
          OR: [
            { createdByUserId: null },
            { deletedAt: { not: null } },
            ...(params.cutoffDate ? [{ updatedAt: { lt: params.cutoffDate } }] : []),
          ],
        },
      ],
    },
    select: {
      id: true,
      projectId: true,
      sandboxSnapshotKey: true,
      sandboxProvider: true,
    },
  });

  if (conversations.length === 0) {
    return 0;
  }

  await Promise.all(
    conversations.map((conversation) =>
      params.deleteSnapshot({
        providerName: conversation.sandboxProvider,
        snapshotKey:
          conversation.sandboxSnapshotKey ??
          getInAppAgentSandboxSnapshotKey(conversation.projectId, conversation.id),
      }),
    ),
  );

  await params.prisma.inAppAgentConversation.updateMany({
    where: {
      projectId: params.projectId,
      id: { in: conversations.map((conversation) => conversation.id) },
    },
    data: {
      providerSessionId: null,
      sandboxSnapshotKey: null,
      sandboxExpiresAt: null,
      sandboxProvider: null,
    },
  });

  return conversations.length;
}
