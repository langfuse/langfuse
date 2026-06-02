import { EventType } from "@ag-ui/core";
import { TRPCError } from "@trpc/server";

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

export type SerializedInAppAgentConversation = {
  id: string;
  title: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

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
    where: { id: params.conversationId, projectId: params.projectId },
    data: { providerSessionId: params.providerSessionId },
  });
}

export async function appendConversationEvent(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
  event: AgUiEvent;
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
        type: String(params.event.type),
        event: toJsonValue(params.event),
      },
    });

    await tx.inAppAgentConversation.update({
      where: {
        id: params.conversationId,
        projectId: params.projectId,
      },
      data: { lastMessageAt: new Date() },
    });
  });
}

export async function getConversationEvents(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
}) {
  const events = await params.prisma.inAppAgentEvent.findMany({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
    },
    orderBy: { sequenceNumber: "asc" },
    select: { event: true },
  });

  return events.flatMap((row) =>
    isAgUiEvent(row.event) ? [row.event as AgUiEvent] : [],
  );
}

export function reduceEventsToMessages(events: readonly AgUiEvent[]) {
  const messages: AgUiMessage[] = [];
  const messageIndexes = new Map<string, number>();
  const textDrafts = new Map<
    string,
    { id: string; role: TextMessageRole; content: string }
  >();
  const toolCallDrafts = new Map<
    string,
    {
      parentMessageId: string;
      name: string;
      args: string;
    }
  >();
  const reasoningEncryptedValues = new Map<string, string>();

  const upsertMessage = (message: AgUiMessage) => {
    const parsed = AgUiMessageSchema.safeParse(message);

    if (!parsed.success) {
      return;
    }

    const existingIndex = messageIndexes.get(parsed.data.id);

    if (existingIndex === undefined) {
      messageIndexes.set(parsed.data.id, messages.length);
      messages.push(parsed.data);
      return;
    }

    messages[existingIndex] = mergeMessages(
      messages[existingIndex]!,
      parsed.data,
    );
  };

  for (const event of events) {
    switch (event.type) {
      case EventType.RUN_STARTED: {
        for (const message of getRunStartedMessages(event)) {
          upsertMessage(message);
        }
        break;
      }
      case EventType.TEXT_MESSAGE_START:
      case EventType.REASONING_MESSAGE_START: {
        const messageId = getString(event, "messageId");
        const role =
          event.type === EventType.REASONING_MESSAGE_START
            ? "reasoning"
            : getTextMessageRole(event);

        if (messageId && role) {
          textDrafts.set(messageId, { id: messageId, role, content: "" });
        }
        break;
      }
      case EventType.TEXT_MESSAGE_CONTENT:
      case EventType.REASONING_MESSAGE_CONTENT: {
        const messageId = getString(event, "messageId");
        const delta = getString(event, "delta") ?? "";
        const draft = messageId ? textDrafts.get(messageId) : undefined;

        if (draft) {
          draft.content += delta;
        }
        break;
      }
      case EventType.REASONING_ENCRYPTED_VALUE: {
        if (getString(event, "subtype") !== "message") {
          break;
        }

        const entityId = getString(event, "entityId");
        const encryptedValue = getString(event, "encryptedValue");

        if (entityId && encryptedValue) {
          reasoningEncryptedValues.set(entityId, encryptedValue);
          const existingIndex = messageIndexes.get(entityId);
          const existing =
            existingIndex === undefined ? undefined : messages[existingIndex];

          if (existing?.role === "reasoning") {
            messages[existingIndex!] = { ...existing, encryptedValue };
          }
        }
        break;
      }
      case EventType.TEXT_MESSAGE_END:
      case EventType.REASONING_MESSAGE_END: {
        const messageId = getString(event, "messageId");
        const draft = messageId ? textDrafts.get(messageId) : undefined;

        if (!draft) {
          break;
        }

        if (draft.role === "reasoning") {
          upsertMessage({
            id: draft.id,
            role: "reasoning",
            content: draft.content,
            ...(reasoningEncryptedValues.get(draft.id)
              ? { encryptedValue: reasoningEncryptedValues.get(draft.id) }
              : {}),
          });
        } else {
          upsertMessage({
            id: draft.id,
            role: draft.role,
            content: draft.content,
          });
        }

        textDrafts.delete(draft.id);
        break;
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
          upsertMessage({
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
        }
        break;
      }
      case EventType.TOOL_CALL_RESULT: {
        const messageId = getString(event, "messageId");
        const toolCallId = getString(event, "toolCallId");
        const content = getString(event, "content");

        if (messageId && toolCallId && content !== undefined) {
          upsertMessage({
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
          upsertMessage({
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
  }

  return messages;
}

type InAppAgentTx = Prisma.TransactionClient;
type TextMessageRole = Extract<
  AgUiMessage["role"],
  "assistant" | "developer" | "system" | "user" | "reasoning"
>;

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

function getRunStartedMessages(event: AgUiEvent): AgUiMessage[] {
  const input = isRecord(event.input) ? event.input : undefined;
  const messages = Array.isArray(input?.messages) ? input.messages : [];

  return messages.flatMap((message) => {
    const parsed = AgUiMessageSchema.safeParse(message);
    return parsed.success ? [parsed.data] : [];
  });
}

function getTextMessageRole(event: AgUiEvent): TextMessageRole | undefined {
  const role = getString(event, "role");

  if (
    role === "assistant" ||
    role === "developer" ||
    role === "system" ||
    role === "user"
  ) {
    return role;
  }

  return undefined;
}

function mergeMessages(existing: AgUiMessage, next: AgUiMessage): AgUiMessage {
  if (existing.role !== next.role) {
    return next;
  }

  if (existing.role === "assistant" && next.role === "assistant") {
    return {
      ...existing,
      ...next,
      content: next.content ?? existing.content,
      toolCalls: mergeToolCalls(existing.toolCalls, next.toolCalls),
    };
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

function isAgUiEvent(event: unknown) {
  return isRecord(event) && typeof event.type === "string";
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

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
