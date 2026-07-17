import { z } from "zod";
import type { InAppAgentWindowMessage } from "../InAppAgentWindow";
import type { InAppAgentPendingToolApproval } from "../InAppAiAgentProvider";
import type { InAppAgentMessageContent } from "../InAppAgentMessage";
import { deduplicateBy } from "@/src/utils/arrays";
import { safeJsonParse, stableJsonStringify } from "@/src/utils/json";
import {
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE,
} from "@/src/ee/features/in-app-agent/constants";
import {
  AgUiMessageSchema,
  type AgUiMessage,
  InAppAgentRateLimitErrorResponseSchema,
  type InAppAgentMessageSource,
  InAppAgentRedirectActionToolResultSchema,
  InAppAgentMessageSourceSchema,
} from "@/src/ee/features/in-app-agent/schema";

export type InAppAgentError =
  | { type: "generic"; message: string }
  | { type: "rate_limit"; retryAt: number };

const InAppAiAgentMessageSchema = AgUiMessageSchema.and(
  z.object({ isLoading: z.boolean().optional() }),
);

export type InAppAiAgentMessage = z.infer<typeof InAppAiAgentMessageSchema>;

export type InAppAgentToolCallContent = {
  type: "tool";
  name: string;
  args: string;
  status: "running" | "succeeded" | "failed" | "denied";
  result?: string;
  error?: string;
  approval?: {
    id: string;
    status: "pending" | "submitting";
  };
};

const InAppAgentToolRejectionErrorSchema = z.object({
  code: z.literal(IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE),
  message: z.string(),
});

// Rejections persisted before structured error codes must remain readable.
const LEGACY_IN_APP_AGENT_TOOL_REJECTION_MESSAGE =
  "Tool call was not approved by the user.";

const TOOL_CALL_STATUS_BY_RESULT_STATE = {
  rejected: "denied",
  error: "failed",
  result: "succeeded",
  pending: "running",
  incomplete: "failed",
} as const satisfies Record<string, InAppAgentToolCallContent["status"]>;

const InAppAgentTransportErrorSchema = z.object({
  message: z.string().optional(),
  payload: z.unknown().optional(),
});

const InAppAgentLegacyErrorPayloadSchema = z.object({
  error: z.string(),
});

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

export function getInAppAgentError(
  error: unknown,
  now = Date.now(),
): InAppAgentError {
  const parsedError = InAppAgentTransportErrorSchema.safeParse(error);
  const payload = parsedError.success ? parsedError.data.payload : undefined;
  const message = getErrorMessage(error);
  const rateLimitError =
    parseRateLimitError(payload) ??
    parseRateLimitError(error) ??
    parseEmbeddedRateLimitError(message);

  if (rateLimitError) {
    return {
      type: "rate_limit",
      retryAt: now + rateLimitError.details.retryAfterSeconds * 1_000,
    };
  }

  return { type: "generic", message };
}

function parseRateLimitError(value: unknown) {
  const parsed = InAppAgentRateLimitErrorResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isInAppAgentRateLimited(
  error: InAppAgentError | null,
  now = Date.now(),
) {
  return error?.type === "rate_limit" && error.retryAt > now;
}

function parseEmbeddedRateLimitError(message: string) {
  const endIndex = message.lastIndexOf("}");
  let startIndex = message.indexOf("{");

  while (startIndex !== -1 && startIndex < endIndex) {
    try {
      const parsed = JSON.parse(
        message.slice(startIndex, endIndex + 1),
      ) as unknown;
      const rateLimitError = parseRateLimitError(parsed);

      if (rateLimitError) {
        return rateLimitError;
      }
    } catch {
      // The transport prefixes JSON with error context, so try the next object.
    }

    startIndex = message.indexOf("{", startIndex + 1);
  }

  return null;
}

function getErrorMessage(error: unknown) {
  const parsedError = InAppAgentTransportErrorSchema.safeParse(error);
  if (!parsedError.success) {
    return "Assistant request failed. Please try again.";
  }

  const legacyPayload = InAppAgentLegacyErrorPayloadSchema.safeParse(
    parsedError.data.payload,
  );
  if (legacyPayload.success) {
    return legacyPayload.data.error;
  }

  return (
    parsedError.data.message ?? "Assistant request failed. Please try again."
  );
}

export function getDrawerMessages({
  error,
  isRunning,
  messages,
  pendingToolApprovals = [],
}: {
  error: unknown;
  isRunning: boolean;
  messages: unknown;
  pendingToolApprovals?: readonly InAppAgentPendingToolApproval[];
}): InAppAgentWindowMessage[] {
  const parsedMessages = z.array(InAppAiAgentMessageSchema).parse(messages);
  const toolResults = getToolResultsByToolCallId(parsedMessages);
  const resolvedToolCallIds = new Set(toolResults.keys());
  const pendingApprovalsByToolCallId = new Map(
    pendingToolApprovals.map((approval) => [approval.id, approval]),
  );
  const mappedPendingApprovalIds = new Set<string>();

  const mappedMessages: InAppAgentWindowMessage[] = [];
  let pendingTools: InAppAgentToolCallContent[] = [];
  let pendingToolGroupId: string | null = null;
  let pendingToolGroupIsLoading = false;
  let pendingSources: InAppAgentMessageSource[] = [];
  const flushPendingTools = () => {
    if (pendingTools.length === 0) {
      return;
    }

    mappedMessages.push({
      id: pendingToolGroupId ?? "tools-pending",
      role: "assistant",
      content: {
        type: "toolGroup",
        tools: pendingTools,
        isLoading: pendingToolGroupIsLoading,
      },
    });
    pendingTools = [];
    pendingToolGroupId = null;
    pendingToolGroupIsLoading = false;
  };

  parsedMessages.forEach((message, index) => {
    if (message.role === "tool") {
      const redirectAction = getRedirectActionFromToolResult(message);

      // Merge redirect actions into the preceding text message when possible for a smoother UI.
      if (redirectAction) {
        const previousRawMessage = parsedMessages[index - 1];
        const previousMessage = mappedMessages[mappedMessages.length - 1];

        if (
          pendingTools.length === 0 &&
          previousRawMessage?.role === "assistant" &&
          previousMessage?.role === "assistant" &&
          previousMessage.id === previousRawMessage.id &&
          previousMessage.content.type === "text"
        ) {
          mappedMessages[mappedMessages.length - 1] = {
            ...previousMessage,
            content: {
              ...previousMessage.content,
              redirectAction,
            },
          };
        } else {
          flushPendingTools();
          mappedMessages.push({
            id: `${message.id}-redirect`,
            role: "assistant",
            content: redirectAction,
          });
        }
      }

      return;
    }

    if (
      message.role === "system" ||
      message.role === "developer" ||
      message.role === "activity"
    ) {
      return;
    }

    const role = message.role === "user" ? "user" : "assistant";

    if (message.role === "reasoning") {
      flushPendingTools();

      const isStreaming = isRunning && !error && message.isLoading === true;

      // Adaptive thinking can emit a reasoning start/end pair without any
      // content; a completed empty block has nothing to disclose, so only a
      // still-streaming one is rendered (as its "Thinking..." placeholder).
      if (!message.content.trim() && !isStreaming) {
        return;
      }

      mappedMessages.push({
        id: message.id,
        role,
        content: {
          type: "reasoning",
          text: message.content,
          isStreaming,
        },
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
        ? (message.toolCalls?.flatMap(
            (toolCall): InAppAgentToolCallContent[] => {
              if (toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME) {
                return [];
              }

              const result = toolResults.get(toolCall.id);
              const pendingApproval = result
                ? undefined
                : findPendingApprovalForToolCall({
                    toolCall,
                    pendingApprovals: pendingToolApprovals,
                    pendingApprovalsByToolCallId,
                    mappedPendingApprovalIds,
                  });

              if (pendingApproval) {
                mappedPendingApprovalIds.add(pendingApproval.id);
              }

              const rejectionError =
                InAppAgentToolRejectionErrorSchema.safeParse(
                  result?.error ? safeJsonParse(result.error) : undefined,
                );
              const isRejected =
                rejectionError.success ||
                result?.error === LEGACY_IN_APP_AGENT_TOOL_REJECTION_MESSAGE;
              let toolError = result?.error;
              if (rejectionError.success) {
                toolError = rejectionError.data.message;
              }

              let resultState: keyof typeof TOOL_CALL_STATUS_BY_RESULT_STATE;
              if (isRejected) {
                resultState = "rejected";
              } else if (toolError !== undefined) {
                resultState = "error";
              } else if (result?.content !== undefined) {
                resultState = "result";
              } else if (isRunning && !error) {
                resultState = "pending";
              } else {
                resultState = "incomplete";
              }
              const status = TOOL_CALL_STATUS_BY_RESULT_STATE[resultState];

              return [
                {
                  type: "tool",
                  name: toolCall.function.name,
                  args: toolCall.function.arguments,
                  status,
                  ...(pendingApproval
                    ? {
                        approval: {
                          id: pendingApproval.id,
                          status: pendingApproval.status,
                        },
                      }
                    : {}),
                  ...(result?.content !== undefined
                    ? { result: result.content }
                    : {}),
                  ...(toolError !== undefined ? { error: toolError } : {}),
                },
              ];
            },
          ) ?? [])
        : [];
    const docsSources = extractLangfuseDocsSources(toolContent);
    const isToolGroupLoading =
      isRunning &&
      !error &&
      message.role === "assistant" &&
      message.isLoading === true;

    if (role === "assistant" && toolContent.length > 0 && !text.trim()) {
      if (docsSources.length > 0) {
        pendingSources = mergeSources(pendingSources, docsSources);
      }

      pendingToolGroupId ??= `tools-${message.id}`;
      pendingTools.push(...toolContent);
      pendingToolGroupIsLoading ||= isToolGroupLoading;
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
        content: {
          type: "toolGroup",
          tools: toolContent,
          isLoading: isToolGroupLoading,
        },
      });
    }
  });

  flushPendingTools();

  for (const approval of pendingToolApprovals) {
    if (
      mappedPendingApprovalIds.has(approval.id) ||
      resolvedToolCallIds.has(approval.id) ||
      resolvedToolCallIds.has(approval.approvalRequest.toolCallId)
    ) {
      continue;
    }

    mappedMessages.push({
      id: `tool-approval-${approval.id}`,
      role: "assistant",
      content: {
        type: "toolGroup",
        tools: [
          {
            type: "tool",
            name: approval.approvalRequest.toolName,
            args: stringifyToolArgs(approval.approvalRequest.args),
            status: "running",
            approval: {
              id: approval.id,
              status: approval.status,
            },
          },
        ],
      },
    });
  }

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
    latestAssistantMessage?.content.type !== "loading" &&
    latestAssistantMessage?.content.type !== "reasoning" &&
    latestAssistantMessage?.content.type !== "redirectAction"
  ) {
    if (latestAssistantMessage?.content.type === "toolGroup") {
      return mappedMessages;
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

function stringifyToolArgs(args: unknown) {
  if (typeof args === "string") {
    return args;
  }

  try {
    return JSON.stringify(args ?? {});
  } catch {
    return "{}";
  }
}

function findPendingApprovalForToolCall({
  toolCall,
  pendingApprovals,
  pendingApprovalsByToolCallId,
  mappedPendingApprovalIds,
}: {
  toolCall: Extract<AgUiMessage, { role: "assistant" }>["toolCalls"] extends
    | Array<infer TToolCall>
    | undefined
    ? TToolCall
    : never;
  pendingApprovals: readonly InAppAgentPendingToolApproval[];
  pendingApprovalsByToolCallId: ReadonlyMap<
    string,
    InAppAgentPendingToolApproval
  >;
  mappedPendingApprovalIds: ReadonlySet<string>;
}) {
  const exactMatch = pendingApprovalsByToolCallId.get(toolCall.id);

  if (exactMatch) {
    return exactMatch;
  }

  const toolArgsFingerprint = stableJsonStringify(
    parseJsonString(toolCall.function.arguments) ?? toolCall.function.arguments,
  );
  const matchingApprovals = pendingApprovals.filter(
    (approval) =>
      !mappedPendingApprovalIds.has(approval.id) &&
      approval.approvalRequest.toolName === toolCall.function.name &&
      stableJsonStringify(approval.approvalRequest.args) ===
        toolArgsFingerprint,
  );

  return matchingApprovals.length === 1 ? matchingApprovals[0] : undefined;
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

function getRedirectActionFromToolResult(
  message: Extract<AgUiMessage, { role: "tool" }>,
): Extract<InAppAgentMessageContent, { type: "redirectAction" }> | null {
  try {
    return InAppAgentRedirectActionToolResultSchema.parse(
      JSON.parse(message.content),
    );
  } catch {
    return null;
  }
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
