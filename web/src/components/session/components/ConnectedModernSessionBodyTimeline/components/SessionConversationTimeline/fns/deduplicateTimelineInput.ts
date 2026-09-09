import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";

import { getConversationEntries } from "@/src/components/session/components/ConnectedModernSessionBodyTimeline/components/SessionConversationTimeline/fns/getConversationEntries";
import { getHistoricalInputIndices } from "@/src/components/session/components/ConnectedModernSessionBodyTimeline/components/SessionConversationTimeline/fns/getHistoricalInputIndices";
import { type SessionTimelineConversationMessage } from "@/src/components/session/components/ConnectedModernSessionBodyTimeline/components/SessionConversationTimeline/fns/processTimelineMessages";

export function deduplicateTimelineInput(
  messages: SessionTimelineConversationMessage[],
  ancestorMessages: readonly NormalizedMessage[],
) {
  const currentInput = getConversationEntries(messages, "input");
  const ancestorInput = getConversationEntries(ancestorMessages, "input");
  const historicalInputIndices = getHistoricalInputIndices(
    ancestorInput,
    currentInput,
  );
  const historicalParts = new Set(
    currentInput
      .filter((_entry, index) => historicalInputIndices.has(index))
      .map((entry) => `${entry.messageIndex}:${entry.partIndex}`),
  );

  return messages.flatMap((message, messageIndex) => {
    if (message.source === "output") return [message];

    const parts = message.parts.filter(
      (_part, partIndex) =>
        !historicalParts.has(`${messageIndex}:${partIndex}`),
    );
    return parts.length > 0 ? [{ ...message, parts }] : [];
  });
}
