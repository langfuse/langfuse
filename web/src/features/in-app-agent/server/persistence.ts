import { TRPCError } from "@trpc/server";
import { InAppAgentMessageRole } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import type {
  Prisma,
  InAppAgentConversation,
  InAppAgentMessage,
  PrismaClient,
} from "@langfuse/shared/src/db";

import {
  AgUiMessageSchema,
  type AgUiMessage,
} from "@/src/features/in-app-agent/schema";

const AG_UI_ROLE_TO_DB_ROLE: Record<string, InAppAgentMessageRole> = {
  user: InAppAgentMessageRole.USER,
  assistant: InAppAgentMessageRole.ASSISTANT,
  system: InAppAgentMessageRole.SYSTEM,
  tool: InAppAgentMessageRole.TOOL,
  activity: InAppAgentMessageRole.ACTIVITY,
  reasoning: InAppAgentMessageRole.REASONING,
};

export type SerializedInAppAgentConversation = {
  id: string;
  title: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedInAppAgentMessage = AgUiMessage;

export function serializeConversation(
  conversation: Pick<
    InAppAgentConversation,
    "id" | "title" | "lastMessageAt" | "createdAt" | "updatedAt"
  >,
): SerializedInAppAgentConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function serializeMessage(
  message: Pick<InAppAgentMessage, "externalId" | "content">,
): SerializedInAppAgentMessage | null {
  const parsed = AgUiMessageSchema.safeParse(message.content);

  if (!parsed.success) {
    return null;
  }

  return {
    ...parsed.data,
    id: message.externalId,
  };
}

export async function getOwnedConversationOrThrow(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
}) {
  const conversation = await params.prisma.inAppAgentConversation.findFirst({
    where: {
      id: params.conversationId,
      projectId: params.projectId,
      createdByUserId: params.userId,
      deletedAt: null,
    },
  });

  if (!conversation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Agent conversation not found",
    });
  }

  return conversation;
}

export async function ensureOwnedConversation(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
}) {
  const existing = await params.prisma.inAppAgentConversation.findFirst({
    where: {
      id: params.conversationId,
      projectId: params.projectId,
      deletedAt: null,
    },
  });

  if (existing) {
    if (existing.createdByUserId !== params.userId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent conversation not found",
      });
    }

    return existing;
  }

  return params.prisma.inAppAgentConversation.create({
    data: {
      id: params.conversationId,
      projectId: params.projectId,
      createdByUserId: params.userId,
    },
  });
}

export async function createRun(params: {
  prisma: PrismaClient;
  runId: string;
  projectId: string;
  conversationId: string;
  userId: string;
  model?: string;
  modelParams?: Prisma.InputJsonValue;
  mcpApiKeyId?: string;
}) {
  const existing = await params.prisma.inAppAgentRun.findUnique({
    where: { id: params.runId },
  });

  if (existing) {
    if (
      existing.projectId !== params.projectId ||
      existing.conversationId !== params.conversationId
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Agent run id is already used",
      });
    }

    return params.prisma.inAppAgentRun.update({
      where: { id: params.runId },
      data: {
        startedAt: existing.startedAt ?? new Date(),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        ...(params.modelParams !== undefined
          ? { modelParams: params.modelParams }
          : {}),
        mcpApiKeyId: params.mcpApiKeyId ?? existing.mcpApiKeyId,
      },
    });
  }

  return params.prisma.inAppAgentRun.create({
    data: {
      id: params.runId,
      projectId: params.projectId,
      conversationId: params.conversationId,
      createdByUserId: params.userId,
      startedAt: new Date(),
      model: params.model,
      modelParams: params.modelParams,
      mcpApiKeyId: params.mcpApiKeyId,
    },
  });
}

export async function finishRun(params: {
  prisma: PrismaClient;
  runId: string;
  projectId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  await params.prisma.inAppAgentRun
    .update({
      where: { id: params.runId, projectId: params.projectId },
      data: {
        finishedAt: new Date(),
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
      },
    })
    .catch((error) =>
      logger.error("Failed to finish in-app agent run", {
        error,
        runId: params.runId,
        projectId: params.projectId,
      }),
    );
}

export async function updateProviderSessionId(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  providerSessionId: string;
}) {
  await params.prisma.inAppAgentConversation.update({
    where: { id: params.conversationId, projectId: params.projectId },
    data: { providerSessionId: params.providerSessionId },
  });
}

export async function appendConversationMessage(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
  message: AgUiMessage;
  runId?: string;
}) {
  const persistableMessage = toPersistableMessage(params.message, 0);

  if (!persistableMessage) {
    return;
  }

  const lastMessageAt = new Date();

  await params.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1
      FROM "in_app_agent_conversations"
      WHERE "id" = ${params.conversationId}
        AND "project_id" = ${params.projectId}
      FOR UPDATE
    `;

    const where = {
      projectId_conversationId_externalId: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        externalId: persistableMessage.externalId,
      },
    };
    const existing = await tx.inAppAgentMessage.findUnique({
      where,
      select: {
        id: true,
        authorUserId: true,
      },
    });

    if (existing) {
      await tx.inAppAgentMessage.update({
        where: { id: existing.id },
        data: {
          ...(params.runId !== undefined ? { runId: params.runId } : {}),
          ...(persistableMessage.role === InAppAgentMessageRole.USER &&
          !existing.authorUserId
            ? { authorUserId: params.userId }
            : {}),
        },
      });
    } else {
      const latestMessage = await tx.inAppAgentMessage.findFirst({
        where: {
          projectId: params.projectId,
          conversationId: params.conversationId,
        },
        select: { sequenceNumber: true },
        orderBy: { sequenceNumber: "desc" },
      });

      await tx.inAppAgentMessage.create({
        data: {
          projectId: params.projectId,
          conversationId: params.conversationId,
          runId: params.runId,
          externalId: persistableMessage.externalId,
          sequenceNumber: (latestMessage?.sequenceNumber ?? -1) + 1,
          role: persistableMessage.role,
          content: persistableMessage.content,
          authorUserId:
            persistableMessage.role === InAppAgentMessageRole.USER
              ? params.userId
              : undefined,
        },
      });
    }

    await tx.inAppAgentConversation.update({
      where: {
        id: params.conversationId,
        projectId: params.projectId,
      },
      data: {
        lastMessageAt,
      },
    });
  });
}

export async function upsertConversationMessages(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
  messages: AgUiMessage[];
}) {
  const persistableMessages = params.messages
    .map((message, index) => toPersistableMessage(message, index))
    .filter((message): message is PersistableMessage => message !== null);

  if (persistableMessages.length === 0) {
    return;
  }

  const lastMessageAt = new Date();

  await params.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1
      FROM "in_app_agent_conversations"
      WHERE "id" = ${params.conversationId}
        AND "project_id" = ${params.projectId}
      FOR UPDATE
    `;

    for (const message of persistableMessages) {
      await tx.inAppAgentMessage.upsert({
        where: {
          projectId_conversationId_externalId: {
            projectId: params.projectId,
            conversationId: params.conversationId,
            externalId: message.externalId,
          },
        },
        create: {
          projectId: params.projectId,
          conversationId: params.conversationId,
          externalId: message.externalId,
          sequenceNumber: message.sequenceNumber,
          role: message.role,
          content: message.content,
          authorUserId:
            message.role === InAppAgentMessageRole.USER
              ? params.userId
              : undefined,
        },
        update: {
          sequenceNumber: message.sequenceNumber,
          role: message.role,
          content: message.content,
        },
      });
    }

    await tx.inAppAgentConversation.update({
      where: {
        id: params.conversationId,
        projectId: params.projectId,
      },
      data: {
        lastMessageAt,
      },
    });
  });
}

type PersistableMessage = {
  externalId: string;
  sequenceNumber: number;
  role: InAppAgentMessageRole;
  content: Prisma.InputJsonValue;
};

function toPersistableMessage(
  message: AgUiMessage,
  sequenceNumber: number,
): PersistableMessage | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  return {
    externalId: message.id,
    sequenceNumber,
    role: AG_UI_ROLE_TO_DB_ROLE[message.role],
    content: toJsonValue(message),
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
