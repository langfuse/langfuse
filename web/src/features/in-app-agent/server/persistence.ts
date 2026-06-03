import { EventType } from "@ag-ui/core";

import { LangfuseConflictError, LangfuseNotFoundError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import type {
  InAppAgentConversation,
  Prisma,
  PrismaClient,
} from "@langfuse/shared/src/db";

import {
  AgUiMessageSchema,
  type AgUiEvent,
  type AgUiMessage,
} from "@/src/features/in-app-agent/schema";

const ACTIVE_RUN_STALE_AFTER_MS = 10 * 60 * 1000;
const ACTIVE_RUN_CONFLICT_MESSAGE =
  "Assistant is already responding in this conversation";
const STALE_RUN_ERROR_CODE = "stale";
const STALE_RUN_ERROR_MESSAGE =
  "Run was marked stale before starting a new run";

export type SerializedInAppAgentConversation = {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeConversation(
  conversation: Pick<
    InAppAgentConversation,
    "id" | "title" | "createdAt" | "updatedAt"
  >,
): SerializedInAppAgentConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
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
    throw new LangfuseNotFoundError("Agent conversation not found");
  }

  return conversation;
}

export async function ensureOwnedConversation(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
}) {
  const existing = await params.prisma.inAppAgentConversation.findUnique({
    where: {
      id_projectId: {
        id: params.conversationId,
        projectId: params.projectId,
      },
    },
  });

  if (existing) {
    if (existing.createdByUserId !== params.userId || existing.deletedAt) {
      throw new LangfuseNotFoundError("Agent conversation not found");
    }

    return existing;
  }

  return params.prisma.inAppAgentConversation.create({
    data: {
      id: params.conversationId,
      projectId: params.projectId,
      createdByUserId: params.userId,
      // TODO: we want to auto-generate titles based on content later
      title: getDefaultConversationTitle(new Date()),
    },
  });
}

export async function createRun(params: {
  prisma: PrismaClient;
  runId: string;
  projectId: string;
  conversationId: string;
  triggeredByUserId: string;
  model?: string;
  mcpApiKeyId?: string;
}) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - ACTIVE_RUN_STALE_AFTER_MS);

  return params.prisma.$transaction(async (tx) => {
    await lockConversation(tx, params.projectId, params.conversationId);

    // The v1 agent is foreground-only. If a stream dies before finishRun runs,
    // lazily mark the old run stale so it does not block the conversation forever.
    await tx.inAppAgentRun.updateMany({
      where: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        finishedAt: null,
        createdAt: { lt: staleBefore },
      },
      data: {
        finishedAt: now,
        errorCode: STALE_RUN_ERROR_CODE,
        errorMessage: STALE_RUN_ERROR_MESSAGE,
      },
    });

    const activeRun = await tx.inAppAgentRun.findFirst({
      where: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        finishedAt: null,
      },
      select: { id: true },
    });

    if (activeRun) {
      throw new LangfuseConflictError(ACTIVE_RUN_CONFLICT_MESSAGE);
    }

    return tx.inAppAgentRun.create({
      data: {
        id: params.runId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        triggeredByUserId: params.triggeredByUserId,
        model: params.model,
        mcpApiKeyId: params.mcpApiKeyId,
      },
    });
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
    .updateMany({
      where: {
        id: params.runId,
        projectId: params.projectId,
        finishedAt: null,
      },
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
    where: {
      id_projectId: {
        id: params.conversationId,
        projectId: params.projectId,
      },
    },
    data: { providerSessionId: params.providerSessionId },
  });
}

export async function appendMessagesSnapshot(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
  messages: readonly AgUiMessage[];
}) {
  await params.prisma.$transaction(async (tx) => {
    await lockConversation(tx, params.projectId, params.conversationId);

    const latestEvent = await tx.inAppAgentEvent.findFirst({
      where: {
        projectId: params.projectId,
        conversationId: params.conversationId,
      },
      select: { sequenceNumber: true },
      orderBy: { sequenceNumber: "desc" },
    });
    await tx.inAppAgentEvent.create({
      data: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        runId: params.runId,
        sequenceNumber: (latestEvent?.sequenceNumber ?? -1) + 1,
        type: EventType.MESSAGES_SNAPSHOT,
        event: {
          type: EventType.MESSAGES_SNAPSHOT,
          messages: params.messages as Prisma.InputJsonArray,
        },
      },
    });

    await tx.inAppAgentConversation.update({
      where: {
        id_projectId: {
          id: params.conversationId,
          projectId: params.projectId,
        },
      },
      data: { updatedAt: new Date() },
    });
  });
}

export async function getLatestConversationMessages(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
}) {
  const snapshot = await params.prisma.inAppAgentEvent.findFirst({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      type: EventType.MESSAGES_SNAPSHOT,
    },
    orderBy: { sequenceNumber: "desc" },
    select: { event: true },
  });

  const event = snapshot?.event;

  if (!isRecord(event) || !Array.isArray(event.messages)) {
    return [];
  }

  return parseMessages(event.messages);
}

export function createConversationMessageAccumulator(
  initialMessages: readonly AgUiMessage[],
) {
  const messages: AgUiMessage[] = [];
  const messageIndexes = new Map<string, number>();
  const textDrafts = new Map<string, { id: string; content: string }>();
  const toolCallDrafts = new Map<
    string,
    {
      parentMessageId: string;
      name: string;
      args: string;
    }
  >();

  const upsertMessage = (message: AgUiMessage): boolean => {
    const parsed = AgUiMessageSchema.safeParse(message);

    if (!parsed.success) {
      return false;
    }

    const existingIndex = messageIndexes.get(parsed.data.id);

    if (existingIndex === undefined) {
      messageIndexes.set(parsed.data.id, messages.length);
      messages.push(parsed.data);
      return true;
    }

    messages[existingIndex] = mergeMessages(
      messages[existingIndex]!,
      parsed.data,
    );

    return true;
  };

  for (const message of initialMessages) {
    upsertMessage(message);
  }

  const processEvent = (event: AgUiEvent): boolean => {
    switch (event.type) {
      case EventType.TEXT_MESSAGE_START: {
        const messageId = getString(event, "messageId");

        if (messageId && getString(event, "role") === "assistant") {
          textDrafts.set(messageId, { id: messageId, content: "" });
        }
        break;
      }
      case EventType.TEXT_MESSAGE_CONTENT: {
        const messageId = getString(event, "messageId");
        const delta = getString(event, "delta") ?? "";
        const draft = messageId ? textDrafts.get(messageId) : undefined;

        if (draft) {
          draft.content += delta;
        }
        break;
      }
      case EventType.TEXT_MESSAGE_END: {
        const messageId = getString(event, "messageId");
        const draft = messageId ? textDrafts.get(messageId) : undefined;

        if (!draft) {
          break;
        }

        const changed = upsertMessage({
          id: draft.id,
          role: "assistant",
          content: draft.content,
        });

        textDrafts.delete(draft.id);
        return changed;
      }
      case EventType.TOOL_CALL_START: {
        const toolCallId = getString(event, "toolCallId");
        const parentMessageId = getString(event, "parentMessageId");
        const name = getString(event, "toolCallName");

        if (toolCallId && parentMessageId && name) {
          toolCallDrafts.set(toolCallId, {
            parentMessageId,
            name,
            args: "",
          });
        }
        break;
      }
      case EventType.TOOL_CALL_ARGS: {
        const toolCallId = getString(event, "toolCallId");
        const draft = toolCallId ? toolCallDrafts.get(toolCallId) : undefined;

        if (draft) {
          draft.args += getString(event, "delta") ?? "";
        }
        break;
      }
      case EventType.TOOL_CALL_END: {
        const toolCallId = getString(event, "toolCallId");
        const draft = toolCallId ? toolCallDrafts.get(toolCallId) : undefined;

        if (toolCallId && draft) {
          const changed = upsertMessage({
            id: draft.parentMessageId,
            role: "assistant",
            toolCalls: [
              {
                id: toolCallId,
                type: "function",
                function: {
                  name: draft.name,
                  arguments: draft.args,
                },
              },
            ],
          });
          toolCallDrafts.delete(toolCallId);
          return changed;
        }
        break;
      }
      case EventType.TOOL_CALL_RESULT: {
        const messageId = getString(event, "messageId");
        const toolCallId = getString(event, "toolCallId");
        const content = getString(event, "content");

        if (messageId && toolCallId && content !== undefined) {
          return upsertMessage({
            id: messageId,
            role: "tool",
            content,
            toolCallId,
            ...(getString(event, "error")
              ? { error: getString(event, "error") }
              : {}),
          });
        }
        break;
      }
      case EventType.ACTIVITY_SNAPSHOT: {
        const messageId = getString(event, "messageId");
        const activityType = getString(event, "activityType");
        const content = event.content;

        if (messageId && activityType && isRecord(content)) {
          return upsertMessage({
            id: messageId,
            role: "activity",
            activityType,
            content,
          });
        }
        break;
      }
      default:
        break;
    }

    return false;
  };

  return {
    getMessages: () => [...messages],
    upsertMessage,
    processEvent,
  };
}

type InAppAgentTx = Prisma.TransactionClient;

async function lockConversation(
  tx: InAppAgentTx,
  projectId: string,
  conversationId: string,
) {
  await tx.$queryRaw`
    SELECT 1
    FROM "in_app_agent_conversations"
    WHERE "id" = ${conversationId}
      AND "project_id" = ${projectId}
    FOR UPDATE
  `;
}

function parseMessages(messages: unknown[]): AgUiMessage[] {
  return messages.flatMap((message) => {
    const parsed = AgUiMessageSchema.safeParse(message);
    return parsed.success ? [parsed.data] : [];
  });
}

function mergeMessages(existing: AgUiMessage, next: AgUiMessage): AgUiMessage {
  if (existing.role !== next.role) {
    return next;
  }

  if (existing.role === "assistant" && next.role === "assistant") {
    return compactObject({
      ...existing,
      ...next,
      content: next.content ?? existing.content,
      toolCalls: mergeToolCalls(existing.toolCalls, next.toolCalls),
    }) as AgUiMessage;
  }

  return next;
}

function mergeToolCalls(
  existing: Extract<AgUiMessage, { role: "assistant" }>["toolCalls"],
  next: Extract<AgUiMessage, { role: "assistant" }>["toolCalls"],
) {
  if (!existing?.length) {
    return next;
  }

  if (!next?.length) {
    return existing;
  }

  const byId = new Map(existing.map((toolCall) => [toolCall.id, toolCall]));

  for (const toolCall of next) {
    byId.set(toolCall.id, toolCall);
  }

  return Array.from(byId.values());
}

function getString(event: unknown, key: string): string | undefined {
  if (!isRecord(event)) {
    return undefined;
  }

  const value = event[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function getDefaultConversationTitle(date: Date) {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `Chat on ${weekday} at ${hours}:${minutes}`;
}
