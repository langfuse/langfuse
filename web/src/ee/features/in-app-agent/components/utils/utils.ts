import { z } from "zod";
import type { InAppAgentWindowMessage } from "../InAppAgentWindow";
import type { InAppAgentToolCallContent } from "../InAppAgentMessage";
import { deduplicateBy } from "@/src/utils/arrays";
import {
  AgUiMessageSchema,
  type AgUiMessage,
  type InAppAgentMessageSource,
  InAppAgentMessageSourceSchema,
} from "@/src/ee/features/in-app-agent/schema";

const LangfuseDocsDocumentSchema = z.object({
  type: z.literal("document"),
  title: z.string().trim().optional(),
  url: z.string().trim().min(1),
});

const InkeepChoiceContentSourceSchema = z
  .object({
    content: z.array(z.unknown()),
  })
  .transform(({ content }): InAppAgentMessageSource[] => {
    return content.flatMap((entry) => {
      const parsedDocument = LangfuseDocsDocumentSchema.safeParse(entry);

      if (!parsedDocument.success) {
        return [];
      }

      let faviconUrl: string;

      try {
        faviconUrl = new URL(
          "/favicon.ico",
          parsedDocument.data.url,
        ).toString();
      } catch {
        return [];
      }

      const parsedSource = InAppAgentMessageSourceSchema.safeParse({
        title: parsedDocument.data.title || parsedDocument.data.url,
        url: parsedDocument.data.url,
        faviconUrl,
      });

      return parsedSource.success ? [parsedSource.data] : [];
    });
  });

const InkeepChoiceResultSchema = z.object({
  _meta: z.object({
    choices: z.array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    ),
  }),
});

export function getDrawerMessages({
  error,
  isRunning,
  messages,
}: {
  error: unknown;
  isRunning: boolean;
  messages: unknown;
}): InAppAgentWindowMessage[] {
  const parsedMessages = z.array(AgUiMessageSchema).parse(messages);
  const toolResults = getToolResultsByToolCallId(parsedMessages);

  const mappedMessages: InAppAgentWindowMessage[] = [];
  let pendingTools: InAppAgentToolCallContent[] = [];
  let pendingToolGroupId: string | null = null;
  let pendingSources: InAppAgentMessageSource[] = [];
  const flushPendingTools = () => {
    if (pendingTools.length === 0) {
      return;
    }

    mappedMessages.push({
      id: pendingToolGroupId ?? "tools-pending",
      role: "assistant",
      content: { type: "toolGroup", tools: pendingTools },
    });
    pendingTools = [];
    pendingToolGroupId = null;
  };

  parsedMessages.forEach((message, index) => {
    if (
      message.role === "system" ||
      message.role === "developer" ||
      message.role === "tool" ||
      message.role === "activity"
    ) {
      return;
    }

    const role = message.role === "user" ? "user" : "assistant";
    const isLoading = message.role === "reasoning";

    if (isLoading) {
      flushPendingTools();

      const hasLaterAssistantMessage = parsedMessages.some(
        (message, messageIndex) =>
          messageIndex > index && message.role === "assistant",
      );

      if (!isRunning || hasLaterAssistantMessage) {
        return;
      }

      mappedMessages.push({
        id: message.id,
        role,
        content: { type: "loading" },
      });
      return;
    }

    const text =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .flatMap((part) => (part.type === "text" ? [part.text] : []))
              .join("")
          : "";

    const toolContent =
      message.role === "assistant"
        ? (message.toolCalls?.map((toolCall): InAppAgentToolCallContent => {
            const result = toolResults.get(toolCall.id);

            return {
              type: "tool",
              name: toolCall.function.name,
              args: toolCall.function.arguments,
              ...(result?.content !== undefined
                ? { result: result.content }
                : {}),
              ...(result?.error !== undefined ? { error: result.error } : {}),
            };
          }) ?? [])
        : [];
    const docsSources = extractLangfuseDocsSources(toolContent);

    if (role === "assistant" && toolContent.length > 0 && !text.trim()) {
      if (docsSources.length > 0) {
        pendingSources = mergeSources(pendingSources, docsSources);
      }

      pendingToolGroupId ??= `tools-${message.id}`;
      pendingTools.push(...toolContent);
      return;
    }

    flushPendingTools();

    if (role === "assistant" && !text.trim() && toolContent.length === 0) {
      return;
    }

    if (text.trim() || role === "user") {
      const sources = role === "assistant" ? pendingSources : [];

      if (role === "user") {
        pendingSources = [];
      }

      mappedMessages.push({
        id: message.id,
        ...(message.role === "assistant" && message.runId
          ? { runId: message.runId }
          : {}),
        role,
        content: {
          type: "text",
          text,
          ...(sources.length > 0 ? { sources } : {}),
          ...(message.role === "assistant" && message.feedback
            ? { feedback: message.feedback }
            : {}),
        },
      });

      if (role === "assistant") {
        pendingSources = [];

        if (docsSources.length > 0) {
          pendingSources = mergeSources(pendingSources, docsSources);
        }
      }
    }

    if (toolContent.length > 0) {
      mappedMessages.push({
        id: `${message.id}-tools`,
        role,
        content: { type: "toolGroup", tools: toolContent },
      });
    }
  });

  flushPendingTools();

  const latestUserMessageIndex = mappedMessages.findLastIndex(
    (message) => message.role === "user",
  );
  const latestAssistantMessageIndex = mappedMessages.findLastIndex(
    (message, index) =>
      index > latestUserMessageIndex && message.role === "assistant",
  );
  const latestAssistantMessage = mappedMessages[latestAssistantMessageIndex];

  // Insert an optimistic loading message.
  if (
    isRunning &&
    !error &&
    latestUserMessageIndex >= 0 &&
    latestAssistantMessage?.content.type !== "text" &&
    latestAssistantMessage?.content.type !== "loading"
  ) {
    if (latestAssistantMessage?.content.type === "toolGroup") {
      return mappedMessages.map((message, index) =>
        index === latestAssistantMessageIndex
          ? {
              ...message,
              content: { ...latestAssistantMessage.content, isLoading: true },
            }
          : message,
      );
    }

    const hasAssistantAnswer = mappedMessages.some(
      (message) =>
        message.role === "assistant" && message.content.type === "text",
    );

    return [
      ...mappedMessages,
      {
        id: hasAssistantAnswer ? "loading" : "connecting",
        role: "assistant",
        content: hasAssistantAnswer
          ? { type: "loading" }
          : { type: "loading", label: "Connecting..." },
      } satisfies InAppAgentWindowMessage,
    ];
  }

  return mappedMessages;
}

function getToolResultsByToolCallId(messages: readonly AgUiMessage[]) {
  const results = new Map<string, Extract<AgUiMessage, { role: "tool" }>>();

  for (const message of messages) {
    if (message.role === "tool") {
      results.set(message.toolCallId, message);
    }
  }

  return results;
}

export function extractLangfuseDocsSources(
  tools: readonly InAppAgentToolCallContent[],
): InAppAgentMessageSource[] {
  return mergeSources(
    [],
    tools.flatMap((tool) => {
      if (!tool.name.startsWith("langfuseDocs_") || !tool.result) {
        return [];
      }

      return extractSourcesFromToolResult(tool.result);
    }),
  );
}

function extractSourcesFromToolResult(
  result: string,
): InAppAgentMessageSource[] {
  const parsed = parseJsonString(result);
  const parsedResult = InkeepChoiceResultSchema.safeParse(parsed);

  if (!parsedResult.success) {
    return [];
  }

  return parsedResult.data._meta.choices.flatMap((choice) => {
    const parsedContent = parseJsonString(choice.message.content);
    const parsedSource =
      InkeepChoiceContentSourceSchema.safeParse(parsedContent);

    if (!parsedSource.success) {
      return [];
    }

    return parsedSource.data;
  });
}

function parseJsonString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function mergeSources(
  existing: readonly InAppAgentMessageSource[],
  next: readonly InAppAgentMessageSource[],
): InAppAgentMessageSource[] {
  return deduplicateBy([...existing, ...next], (source) => source.url);
}
