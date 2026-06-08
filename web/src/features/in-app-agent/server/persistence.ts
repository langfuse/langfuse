import { compactEvents } from "@ag-ui/client";
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
import { compactTextMessageChunks } from "@/src/features/in-app-agent/server/eventCompaction";

// Keep this close to the route maxDuration (120s) so a killed foreground stream
// does not block the conversation long after the route can no longer respond.
const ACTIVE_RUN_STALE_AFTER_MS = 150 * 1000;
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

export async function replaceRunEvents(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
  events: readonly AgUiEvent[];
}) {
  await params.prisma.$transaction(async (tx) => {
    await lockConversation(tx, params.projectId, params.conversationId);

    const activeRun = await tx.inAppAgentRun.findFirst({
      where: {
        id: params.runId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        finishedAt: null,
      },
      select: { id: true },
    });

    if (!activeRun) {
      return;
    }

    await tx.inAppAgentEvent.deleteMany({
      where: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        runId: params.runId,
      },
    });

    const latestEvent = await tx.inAppAgentEvent.findFirst({
      where: {
        projectId: params.projectId,
        conversationId: params.conversationId,
      },
      select: { sequenceNumber: true },
      orderBy: { sequenceNumber: "desc" },
    });

    const compactedEvents = compactPersistedEvents(params.events).map(
      (event, index) => ({
        projectId: params.projectId,
        conversationId: params.conversationId,
        runId: params.runId,
        sequenceNumber: (latestEvent?.sequenceNumber ?? -1) + index + 1,
        type: String(event.type),
        event: event as unknown as Prisma.InputJsonValue,
      }),
    );

    if (compactedEvents.length > 0) {
      await tx.inAppAgentEvent.createMany({
        data: compactedEvents,
      });
    }

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

  return events.map(({ event }) => event as unknown as AgUiEvent);
}

export async function getConversationMessages(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
}) {
  return getMessagesFromEvents(await getConversationEvents(params));
}

export async function getConversationMessagesForReplay(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
}) {
  return sanitizeConversationMessagesForReplay(
    await getConversationMessages(params),
  );
}

export function getMessagesFromEvents(events: readonly AgUiEvent[]) {
  const accumulator = createConversationMessageAccumulator([]);

  for (const event of events) {
    accumulator.processEvent(event);
  }

  return accumulator.getMessages();
}

function sanitizeConversationMessagesForReplay(
  messages: readonly AgUiMessage[],
): readonly AgUiMessage[] {
  const messagesWithoutOrphanToolCalls =
    dropUnpairedAssistantToolCalls(messages);
  return dropEmptyAssistantMessages(messagesWithoutOrphanToolCalls);
}

export function shouldFlushPersistedEvent(event: AgUiEvent) {
  return (
    event.type === EventType.TEXT_MESSAGE_END ||
    event.type === EventType.TOOL_CALL_END ||
    event.type === EventType.TOOL_CALL_RESULT ||
    event.type === EventType.ACTIVITY_SNAPSHOT ||
    event.type === EventType.RUN_FINISHED ||
    event.type === EventType.RUN_ERROR
  );
}

export function toPersistableAgentEvent(event: AgUiEvent): AgUiEvent | null {
  switch (event.type) {
    case EventType.RUN_STARTED: {
      const input = isRecord(event.input)
        ? {
            ...event.input,
            messages: Array.isArray(event.input.messages)
              ? parseMessages(event.input.messages)
              : [],
            tools: [],
            context: [],
            forwardedProps: {},
          }
        : undefined;

      return compactObject({
        type: event.type,
        threadId: getString(event, "threadId"),
        runId: getString(event, "runId"),
        parentRunId: getString(event, "parentRunId"),
        input,
      });
    }
    case EventType.MESSAGES_SNAPSHOT:
      return null;
    case EventType.TEXT_MESSAGE_CHUNK: {
      const messageId = getString(event, "messageId");
      const role = getTextChunkRole(event);

      if (!messageId || role !== "assistant") {
        return null;
      }

      return compactObject({
        type: event.type,
        messageId,
        role,
        delta: getString(event, "delta") ?? "",
      });
    }
    case EventType.TEXT_MESSAGE_START:
      return compactObject({
        type: event.type,
        messageId: getString(event, "messageId"),
        role: getString(event, "role"),
        name: getString(event, "name"),
      });
    case EventType.TEXT_MESSAGE_CONTENT:
      return compactObject({
        type: event.type,
        messageId: getString(event, "messageId"),
        delta: getString(event, "delta") ?? "",
      });
    case EventType.TEXT_MESSAGE_END:
      return compactObject({
        type: event.type,
        messageId: getString(event, "messageId"),
      });
    case EventType.TOOL_CALL_START:
      return compactObject({
        type: event.type,
        toolCallId: getString(event, "toolCallId"),
        toolCallName: getString(event, "toolCallName"),
        parentMessageId: getString(event, "parentMessageId"),
      });
    case EventType.TOOL_CALL_ARGS:
      return compactObject({
        type: event.type,
        toolCallId: getString(event, "toolCallId"),
        delta: getString(event, "delta") ?? "",
      });
    case EventType.TOOL_CALL_END:
      return compactObject({
        type: event.type,
        toolCallId: getString(event, "toolCallId"),
      });
    case EventType.TOOL_CALL_RESULT:
      return compactObject({
        type: event.type,
        messageId: getString(event, "messageId"),
        toolCallId: getString(event, "toolCallId"),
        content: getString(event, "content"),
        role: getString(event, "role"),
        error: getString(event, "error"),
      });
    case EventType.ACTIVITY_SNAPSHOT:
      return compactObject({
        type: event.type,
        messageId: getString(event, "messageId"),
        activityType: getString(event, "activityType"),
        content: isRecord(event.content) ? event.content : undefined,
        replace: typeof event.replace === "boolean" ? event.replace : undefined,
      });
    case EventType.RUN_FINISHED:
      return compactObject({
        type: event.type,
        threadId: getString(event, "threadId"),
        runId: getString(event, "runId"),
      });
    case EventType.RUN_ERROR:
      return compactObject({
        type: event.type,
        threadId: getString(event, "threadId"),
        runId: getString(event, "runId"),
        message: getString(event, "message"),
        code: getString(event, "code"),
      });
    default:
      return null;
  }
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
      case EventType.RUN_STARTED: {
        if (!isRecord(event.input) || !Array.isArray(event.input.messages)) {
          break;
        }

        let changed = false;

        for (const message of parseMessages(event.input.messages)) {
          changed = upsertMessage(message) || changed;
        }

        return changed;
      }
      case EventType.TEXT_MESSAGE_CHUNK: {
        const messageId = getString(event, "messageId");
        const role = getTextChunkRole(event);

        if (!messageId || role !== "assistant") {
          break;
        }

        const existingIndex = messageIndexes.get(messageId);
        const existingMessage =
          existingIndex === undefined ? undefined : messages[existingIndex];
        const existingContent =
          existingMessage?.role === "assistant"
            ? existingMessage.content
            : undefined;
        const draft = textDrafts.get(messageId) ?? {
          id: messageId,
          content: existingContent ?? "",
        };

        draft.content += getString(event, "delta") ?? "";
        textDrafts.set(messageId, draft);

        return upsertMessage({
          id: draft.id,
          role: "assistant",
          content: draft.content,
        });
      }
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

function compactPersistedEvents(events: readonly AgUiEvent[]): AgUiEvent[] {
  return compactEvents(compactTextMessageChunks(events)) as AgUiEvent[];
}

function dropUnpairedAssistantToolCalls(messages: readonly AgUiMessage[]) {
  const toolResultIds = new Set(
    messages.flatMap((message) =>
      message.role === "tool" ? [message.toolCallId] : [],
    ),
  );
  let changed = false;

  const sanitizedMessages = messages.map((message): AgUiMessage => {
    if (message.role !== "assistant" || !message.toolCalls?.length) {
      return message;
    }

    const pairedToolCalls = message.toolCalls.filter((toolCall) =>
      toolResultIds.has(toolCall.id),
    );

    if (pairedToolCalls.length === message.toolCalls.length) {
      return message;
    }

    changed = true;

    if (pairedToolCalls.length === 0) {
      const sanitizedMessage = { ...message };
      delete sanitizedMessage.toolCalls;
      return sanitizedMessage;
    }

    return { ...message, toolCalls: pairedToolCalls };
  });

  return changed ? sanitizedMessages : messages;
}

function dropEmptyAssistantMessages(messages: readonly AgUiMessage[]) {
  let changed = false;
  const sanitizedMessages = messages.filter((message) => {
    if (message.role !== "assistant") {
      return true;
    }

    const hasContent =
      typeof message.content === "string" && message.content.length > 0;
    const hasToolCalls =
      message.toolCalls !== undefined && message.toolCalls.length > 0;
    const keepMessage = hasContent || hasToolCalls;

    changed = changed || !keepMessage;
    return keepMessage;
  });

  return changed ? sanitizedMessages : messages;
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

function getTextChunkRole(event: unknown) {
  const role = getString(event, "role");

  return role === undefined || role === "assistant" ? "assistant" : role;
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
