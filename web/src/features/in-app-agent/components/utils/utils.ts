import { z } from "zod";
import type { InAppAgentWindowMessage } from "../InAppAgentWindow";
import type { InAppAgentPendingToolApproval } from "../InAppAiAgentProvider";
import type { InAppAgentMessageContent } from "../InAppAgentMessage";
import { deduplicateBy } from "@/src/utils/arrays";
import { safeJsonParse, stableJsonStringify } from "@langfuse/shared";
import {
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE,
  AgUiMessageSchema,
  type AgUiMessage,
  InAppAgentRedirectActionToolResultSchema,
  InAppAgentRateLimitErrorResponseSchema,
} from "@langfuse/shared/in-app-agent";
import {
  InAppAgentMessageFeedbackSchema,
  type InAppAgentMessageSource,
  InAppAgentMessageSourceSchema,
} from "../../schema";

export type InAppAgentError =
  | { type: "generic"; message: string }
  | { type: "rate_limit"; retryAt: number };

const InAppAiAgentMessageSchema = AgUiMessageSchema.and(
  z.object({
    isLoading: z.boolean().optional(),
    feedbackMessageId: z.string().optional(),
    timestamp: z.number().optional(),
    feedback: InAppAgentMessageFeedbackSchema.optional(),
  }),
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

export function getInAppAgentToolDisplayName(toolName: string): string {
  return toolName.replace(/^(?:docs_|langfuseDocs_|langfuse_)/, "");
}

const IN_APP_AGENT_TOOL_PROGRESS_LABEL_OVERRIDES: Record<string, string> = {
  addDashboardPlacement: "Adding widget to dashboard",
  bash: "Running command",
  createAnnotationQueueAssignment: "Assigning annotation queue",
  createAnnotationQueueItem: "Adding to annotation queue",
  createChatPrompt: "Creating chat prompt",
  createDashboardWidget: "Creating widget",
  createTextPrompt: "Creating text prompt",
  deleteAnnotationQueueAssignment: "Unassigning annotation queue",
  deleteDashboardPlacement: "Removing widget from dashboard",
  deleteDashboardWidget: "Deleting widget",
  edit: "Editing file",
  getDashboardWidget: "Inspecting widget",
  getHealth: "Checking health",
  getMetricsSchema: "Checking metrics",
  getObservationFieldSchema: "Checking observation fields",
  getObservationFilterSchema: "Checking observation filters",
  getObservationFilterValues: "Looking up observation filters",
  getPromptUnresolved: "Inspecting prompt",
  listDashboardWidgets: "Browsing widgets",
  proposeRedirect: "Opening page",
  queryMetrics: "Checking metrics",
  read: "Reading file",
  submitFeedback: "Submitting user feedback",
  testEvaluator: "Testing evaluator",
  updateDashboardPlacement: "Moving widget",
  updateDashboardWidget: "Updating widget",
  updatePromptLabels: "Updating prompt labels",
  write: "Writing file",
};

const IN_APP_AGENT_TOOL_PROGRESS_VERBS: Record<string, string> = {
  add: "Adding",
  create: "Creating",
  delete: "Deleting",
  get: "Inspecting",
  list: "Browsing",
  query: "Checking",
  submit: "Submitting",
  update: "Updating",
  upsert: "Saving",
};

const IN_APP_AGENT_TOOL_PROGRESS_NOUNS: Array<[string, string]> = [
  ["dashboard widgets", "widgets"],
  ["dashboard widget", "widget"],
  ["dashboard placement", "widget on dashboard"],
  ["prompt unresolved", "prompt"],
];

// Verbs that read rather than change something: a run of them is one act of
// looking, so a streak collapses to "Looking at <noun>".
const IN_APP_AGENT_TOOL_PROGRESS_LOOKING_VERBS = new Set([
  "Inspecting",
  "Browsing",
  "Checking",
]);

function splitInAppAgentToolNameWords(toolName: string): string[] {
  return toolName
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function isInAppAgentDocsToolName(toolName: string) {
  return /^(?:docs_|langfuseDocs_)/.test(toolName);
}

function isInAppAgentSkillToolName(toolName: string) {
  const strippedName = getInAppAgentToolDisplayName(toolName);
  return /(?:^|[-_])skill(?:$|[-_A-Z])/i.test(strippedName);
}

/**
 * Read a camelCase tool name as an English verb and the thing it acts on, e.g.
 * `listDashboardWidgets` → `{ verb: "Browsing", noun: "widgets" }`. The single
 * source for both the auto headline and the streak-collapsing noun, so the two
 * cannot drift apart. Null when the leading word is not a verb we translate;
 * `noun` is empty for a bare verb such as `getHealth`'s sibling `bash`.
 */
function deriveInAppAgentToolVerbAndNoun(
  strippedName: string,
): { verb: string; noun: string } | null {
  const [firstWord, ...rest] = splitInAppAgentToolNameWords(strippedName);
  const verb = firstWord
    ? IN_APP_AGENT_TOOL_PROGRESS_VERBS[firstWord.toLowerCase()]
    : undefined;

  if (!verb) {
    return null;
  }

  const noun = rest.map((word) => word.toLowerCase()).join(" ");
  const substitution = IN_APP_AGENT_TOOL_PROGRESS_NOUNS.find(
    ([from]) => noun === from,
  );

  return { verb, noun: substitution?.[1] ?? noun };
}

function getAutoInAppAgentToolProgressLabel(strippedName: string): string {
  const derived = deriveInAppAgentToolVerbAndNoun(strippedName);
  if (derived) {
    return derived.noun ? `${derived.verb} ${derived.noun}` : derived.verb;
  }

  const words = splitInAppAgentToolNameWords(strippedName);
  if (words.length === 0) {
    return strippedName;
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function getInAppAgentToolProgressLabelResolution(toolName: string): {
  source: "docs" | "skill" | "override" | "auto";
  label: string;
} {
  if (isInAppAgentDocsToolName(toolName)) {
    return { source: "docs", label: "Reading Langfuse docs" };
  }

  if (isInAppAgentSkillToolName(toolName)) {
    return { source: "skill", label: "Learning skill" };
  }

  const strippedName = getInAppAgentToolDisplayName(toolName);
  const override = IN_APP_AGENT_TOOL_PROGRESS_LABEL_OVERRIDES[strippedName];
  if (override) {
    return { source: "override", label: override };
  }

  return {
    source: "auto",
    label: getAutoInAppAgentToolProgressLabel(strippedName),
  };
}

export function getInAppAgentToolProgressLabel(toolName: string): string {
  return getInAppAgentToolProgressLabelResolution(toolName).label;
}

/** Singularised noun two tools must share to count as one act of looking. */
function getInAppAgentToolProgressNounKey(toolName: string): string | null {
  if (
    isInAppAgentDocsToolName(toolName) ||
    isInAppAgentSkillToolName(toolName)
  ) {
    return null;
  }

  const noun = deriveInAppAgentToolVerbAndNoun(
    getInAppAgentToolDisplayName(toolName),
  )?.noun;

  return noun ? noun.replace(/s\b/g, "") : null;
}

export function getInAppAgentActivityProgressLabel(
  toolNames: string[],
): string {
  const latestToolName = toolNames.at(-1);
  if (!latestToolName) {
    return "Working…";
  }

  const resolution = getInAppAgentToolProgressLabelResolution(latestToolName);
  const latestNounKey = getInAppAgentToolProgressNounKey(latestToolName);
  if (!latestNounKey) {
    return resolution.label;
  }

  let streak = 1;
  for (let index = toolNames.length - 2; index >= 0; index--) {
    const toolName = toolNames[index];
    if (
      !toolName ||
      getInAppAgentToolProgressNounKey(toolName) !== latestNounKey
    ) {
      break;
    }
    streak++;
  }

  // A hand-written override already reads as a sentence, so only the derived
  // verb-and-noun form collapses.
  const derived =
    streak >= 2 && resolution.source === "auto"
      ? deriveInAppAgentToolVerbAndNoun(
          getInAppAgentToolDisplayName(latestToolName),
        )
      : null;

  return derived &&
    IN_APP_AGENT_TOOL_PROGRESS_LOOKING_VERBS.has(derived.verb) &&
    derived.noun
    ? `Looking at ${derived.noun}`
    : resolution.label;
}

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
  runningToolCallIds,
}: {
  error: unknown;
  isRunning: boolean;
  messages: unknown;
  pendingToolApprovals?: readonly InAppAgentPendingToolApproval[];
  runningToolCallIds?: readonly string[];
}): InAppAgentWindowMessage[] {
  const parsedMessages = z.array(InAppAiAgentMessageSchema).parse(messages);
  const toolResults = getToolResultsByToolCallId(parsedMessages);
  const resolvedToolCallIds = new Set(toolResults.keys());
  const pendingApprovalsByToolCallId = new Map(
    pendingToolApprovals.map((approval) => [approval.id, approval]),
  );
  const runningToolCallIdSet = runningToolCallIds
    ? new Set(runningToolCallIds)
    : null;
  const mappedPendingApprovalIds = new Set<string>();

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
      content: {
        type: "toolGroup",
        tools: pendingTools,
      },
    });
    pendingTools = [];
    pendingToolGroupId = null;
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
        timestamp: message.timestamp,
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
              } else if (
                runningToolCallIdSet
                  ? runningToolCallIdSet.has(toolCall.id)
                  : isRunning && !error
              ) {
                resultState = "pending";
              } else {
                resultState = "incomplete";
              }

              if (resultState === "incomplete" && !pendingApproval) {
                return [];
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
        timestamp: message.timestamp,
        ...(message.role === "assistant" && message.runId
          ? { runId: message.runId }
          : {}),
        ...(message.role === "assistant" && message.feedbackMessageId
          ? { feedbackMessageId: message.feedbackMessageId }
          : {}),
        role,
        content: {
          type: "text",
          text,
          ...(message.role === "assistant" && message.isLoading
            ? { isStreaming: true }
            : {}),
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

function extractLangfuseDocsSources(
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
