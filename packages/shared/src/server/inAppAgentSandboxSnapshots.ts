import { type InAppAgentSandboxProvider, type PrismaClient } from "../db";

type SandboxConversationPrisma = {
  inAppAgentConversation: Pick<
    PrismaClient["inAppAgentConversation"],
    "findUnique" | "findMany" | "update" | "updateMany"
  >;
};

type DeleteSandboxSnapshot = (params: {
  sandboxProvider: InAppAgentSandboxProvider;
  snapshotKey: string;
  sessionId?: string | null;
}) => Promise<{ skipped: boolean }>;

const sandboxStatePresenceFilter = {
  OR: [
    { providerSessionId: { not: null } },
    { sandboxSnapshotKey: { not: null } },
    { sandboxExpiresAt: { not: null } },
    { sandboxProvider: { not: null } },
  ],
};

const clearedSandboxState = {
  providerSessionId: null,
  sandboxSnapshotKey: null,
  sandboxExpiresAt: null,
  sandboxProvider: null,
};

export function getInAppAgentSandboxSnapshotKey(
  projectId: string,
  conversationId: string,
) {
  return `in-app-agent-sandboxes/${projectId}/${conversationId}.snapshot`;
}

export function getSandboxCleanupWhere(params: {
  now: Date;
  projectId?: string;
  cutoffDate?: Date;
}) {
  return {
    ...(params.projectId ? { projectId: params.projectId } : {}),
    AND: [
      sandboxStatePresenceFilter,
      {
        OR: [
          { createdByUserId: null },
          { deletedAt: { not: null } },
          { sandboxExpiresAt: { lt: params.now } },
          ...(params.cutoffDate
            ? [{ updatedAt: { lt: params.cutoffDate } }]
            : []),
        ],
      },
    ],
  };
}

export async function clearInAppAgentConversationSandbox(params: {
  prisma: SandboxConversationPrisma;
  projectId: string;
  conversationId: string;
  deleteSnapshot: DeleteSandboxSnapshot;
}): Promise<{ skipped: boolean }> {
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
    return { skipped: true };
  }

  let skipped = true;

  if (
    conversation.sandboxProvider &&
    (conversation.providerSessionId ||
      conversation.sandboxSnapshotKey ||
      conversation.sandboxExpiresAt)
  ) {
    const result = await params.deleteSnapshot({
      sandboxProvider: conversation.sandboxProvider,
      sessionId: conversation.providerSessionId,
      snapshotKey:
        conversation.sandboxSnapshotKey ??
        getInAppAgentSandboxSnapshotKey(
          conversation.projectId,
          conversation.id,
        ),
    });

    skipped = result.skipped;
  }

  await params.prisma.inAppAgentConversation.update({
    where: {
      id_projectId: {
        id: params.conversationId,
        projectId: params.projectId,
      },
    },
    data: clearedSandboxState,
  });

  return { skipped };
}

export async function clearExpiredInAppAgentProjectSandboxes(params: {
  prisma: SandboxConversationPrisma;
  projectId: string;
  cutoffDate?: Date;
  now?: Date;
  deleteSnapshot: DeleteSandboxSnapshot;
}): Promise<{ deleted: number; skipped: number }> {
  const now = params.now ?? new Date();
  const conversations = await params.prisma.inAppAgentConversation.findMany({
    where: getSandboxCleanupWhere({
      now,
      projectId: params.projectId,
      cutoffDate: params.cutoffDate,
    }),
    select: {
      id: true,
      projectId: true,
      providerSessionId: true,
      sandboxSnapshotKey: true,
      sandboxProvider: true,
    },
  });

  if (conversations.length === 0) {
    return { deleted: 0, skipped: 0 };
  }

  const results = await Promise.all(
    conversations
      .filter(
        (
          conversation,
        ): conversation is typeof conversation & {
          sandboxProvider: InAppAgentSandboxProvider;
        } => Boolean(conversation.sandboxProvider),
      )
      .map((conversation) =>
        params.deleteSnapshot({
          sandboxProvider: conversation.sandboxProvider,
          sessionId: conversation.providerSessionId,
          snapshotKey:
            conversation.sandboxSnapshotKey ??
            getInAppAgentSandboxSnapshotKey(
              conversation.projectId,
              conversation.id,
            ),
        }),
      ),
  );

  await params.prisma.inAppAgentConversation.updateMany({
    where: {
      projectId: params.projectId,
      id: { in: conversations.map((conversation) => conversation.id) },
    },
    data: clearedSandboxState,
  });

  const deleted = results.filter((result) => !result.skipped).length;
  const skipped = results.filter((result) => result.skipped).length;

  return { deleted, skipped };
}
