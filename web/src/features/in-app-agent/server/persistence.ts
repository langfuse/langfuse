import { TRPCError } from "@trpc/server";
import {
  InAppAgentMessageRole,
  InAppAgentRunStatus,
} from "@langfuse/shared/src/db";
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

const MAX_TITLE_LENGTH = 80;

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
  title?: string | null;
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
      title: normalizeTitle(params.title),
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
  modelProvider?: string;
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
        status: InAppAgentRunStatus.RUNNING,
        startedAt: existing.startedAt ?? new Date(),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
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
      status: InAppAgentRunStatus.RUNNING,
      startedAt: new Date(),
      model: params.model,
      modelProvider: params.modelProvider,
      mcpApiKeyId: params.mcpApiKeyId,
      allowedTools: [] satisfies Prisma.InputJsonValue,
    },
  });
}

export async function updateRunStatus(params: {
  prisma: PrismaClient;
  runId: string;
  projectId: string;
  status: InAppAgentRunStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  await params.prisma.inAppAgentRun
    .update({
      where: { id: params.runId, projectId: params.projectId },
      data: {
        status: params.status,
        finishedAt:
          params.status === InAppAgentRunStatus.RUNNING ? null : new Date(),
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
      },
    })
    .catch(() => undefined);
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

export async function upsertConversationMessages(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
  messages: AgUiMessage[];
  runId?: string;
}) {
  const persistableMessages = params.messages
    .map((message, index) => toPersistableMessage(message, index))
    .filter((message): message is PersistableMessage => message !== null);

  if (persistableMessages.length === 0) {
    return;
  }

  const lastMessageAt = new Date();
  const firstUserText = persistableMessages.find(
    (message) => message.role === InAppAgentMessageRole.USER,
  )?.text;

  await params.prisma.$transaction([
    ...persistableMessages.map((message) =>
      params.prisma.inAppAgentMessage.upsert({
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
          runId: params.runId,
          externalId: message.externalId,
          sequenceNumber: message.sequenceNumber,
          role: message.role,
          content: message.content,
          text: message.text,
          authorUserId:
            message.role === InAppAgentMessageRole.USER
              ? params.userId
              : undefined,
        },
        update: {
          runId: params.runId,
          sequenceNumber: message.sequenceNumber,
          role: message.role,
          content: message.content,
          text: message.text,
        },
      }),
    ),
    params.prisma.inAppAgentConversation.update({
      where: {
        id: params.conversationId,
        projectId: params.projectId,
      },
      data: {
        lastMessageAt,
      },
    }),
    ...(firstUserText
      ? [
          params.prisma.inAppAgentConversation.updateMany({
            where: {
              id: params.conversationId,
              projectId: params.projectId,
              title: null,
            },
            data: {
              title: normalizeTitle(firstUserText),
            },
          }),
        ]
      : []),
  ]);
}

export function normalizeTitle(title: string | null | undefined) {
  const normalized = title?.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > MAX_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_TITLE_LENGTH - 3)}...`
    : normalized;
}

type PersistableMessage = {
  externalId: string;
  sequenceNumber: number;
  role: InAppAgentMessageRole;
  content: Prisma.InputJsonValue;
  text: string | null;
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
    text: getMessageText(message),
  };
}

function getMessageText(message: AgUiMessage): string | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  const content = message.content;

  if (typeof content === "string") {
    const text = content.trim();
    return text ? text : null;
  }

  if (Array.isArray(content)) {
    const text = content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("")
      .trim();

    return text ? text : null;
  }

  return null;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
