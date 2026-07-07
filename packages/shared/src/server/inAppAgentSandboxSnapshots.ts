import { type InAppAgentSandboxProvider, type PrismaClient } from "../db";

type SandboxConversationPrisma = {
  inAppAgentConversation: Pick<
    PrismaClient["inAppAgentConversation"],
    "findUnique" | "update"
  >;
};

type DeleteSandboxSnapshot = (params: {
  sandboxProvider: InAppAgentSandboxProvider;
  snapshotKey: string;
  sessionId?: string | null;
}) => Promise<{ skipped: boolean }>;

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
