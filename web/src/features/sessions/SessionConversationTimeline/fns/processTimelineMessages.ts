import {
  type NormalizedMessage,
  type NormalizedMessagePart,
  type ToolCallPart,
} from "@langfuse/shared/src/utils/normalized-io";

import {
  getConversationEntries,
  type ConversationEntry,
} from "@/src/features/sessions/SessionConversationTimeline/fns/getConversationEntries";
import { getHistoricalInputIndices } from "@/src/features/sessions/SessionConversationTimeline/fns/getHistoricalInputIndices";

type ConversationPart = Exclude<
  NormalizedMessagePart,
  { type: "tool-call" | "tool-result" }
>;

export type SessionTimelineConversationMessage = Omit<
  NormalizedMessage,
  "parts"
> & {
  parts: ConversationPart[];
};

function getVisibleMessages({
  messages,
  currentInput,
  historicalInputIndices,
}: {
  messages: NormalizedMessage[];
  currentInput: ConversationEntry[];
  historicalInputIndices: ReadonlySet<number>;
}) {
  const historicalParts = new Set(
    currentInput
      .filter((_entry, index) => historicalInputIndices.has(index))
      .map((entry) => `${entry.messageIndex}:${entry.partIndex}`),
  );
  const visibleMessages: SessionTimelineConversationMessage[] = [];

  messages.forEach((message, messageIndex) => {
    const parts = message.parts.filter(
      (part, partIndex): part is ConversationPart => {
        if (part.type === "tool-call" || part.type === "tool-result") {
          return false;
        }
        if (message.source === "output") return true;

        return !historicalParts.has(`${messageIndex}:${partIndex}`);
      },
    );
    if (parts.length === 0) return;

    if (message.role !== "system") {
      visibleMessages.push({ ...message, parts });
      return;
    }

    const systemMessage = visibleMessages.find(
      (visibleMessage) => visibleMessage.role === "system",
    );
    if (systemMessage) {
      systemMessage.parts = systemMessage.parts.concat(parts);
      return;
    }

    visibleMessages.push({ ...message, parts });
  });

  return visibleMessages;
}

/**
 * Produces the newly added conversation and tool rows for each observation.
 * Input part occurrences already present in the previous conversation context
 * are omitted; outputs always remain visible and become the next history.
 */
export function processTimelineMessages({
  messageGroups,
  reconcileHistory,
  standaloneToolCallIdsByGroup,
}: {
  messageGroups: readonly (NormalizedMessage[] | null)[];
  reconcileHistory: readonly boolean[];
  standaloneToolCallIdsByGroup: readonly ReadonlySet<string>[];
}) {
  const processedGroups: Array<{
    messages: SessionTimelineConversationMessage[];
    rolledUpToolCalls: ToolCallPart[];
  }> = [];
  let previousContext: ConversationEntry[] = [];

  for (const [groupIndex, messages] of messageGroups.entries()) {
    if (messages === null) {
      processedGroups.push({ messages: [], rolledUpToolCalls: [] });
      continue;
    }

    const currentInput = getConversationEntries(messages, "input");
    const currentOutput = getConversationEntries(messages, "output");
    const shouldReconcileHistory = reconcileHistory[groupIndex] ?? false;
    const historicalInputIndices = shouldReconcileHistory
      ? getHistoricalInputIndices(previousContext, currentInput)
      : new Set<number>();
    const rolledUpToolCalls = messages.flatMap((message) =>
      message.source === "output"
        ? message.parts.filter(
            (part): part is ToolCallPart =>
              part.type === "tool-call" &&
              (!part.toolCallId ||
                !standaloneToolCallIdsByGroup[groupIndex]?.has(
                  part.toolCallId,
                )),
          )
        : [],
    );

    processedGroups.push({
      messages: getVisibleMessages({
        messages,
        currentInput,
        historicalInputIndices,
      }),
      rolledUpToolCalls,
    });
    if (shouldReconcileHistory) {
      previousContext = currentInput.concat(currentOutput);
    }
  }

  return processedGroups;
}
