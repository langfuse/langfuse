import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";

import { getConversationEntries } from "@/src/features/sessions/SessionConversationTimeline/fns/getConversationEntries";
import { getHistoricalInputIndices } from "@/src/features/sessions/SessionConversationTimeline/fns/getHistoricalInputIndices";
import { type SessionTimelineConversationMessage } from "@/src/features/sessions/SessionConversationTimeline/fns/processTimelineMessages";

export function deduplicateTimelineInput(
  messages: SessionTimelineConversationMessage[],
  ancestorMessages: readonly NormalizedMessage[],
) {
  const currentEntries = getConversationEntries(messages);
  const ancestorEntries = getConversationEntries(ancestorMessages);
  const historicalEntryIndices = getHistoricalInputIndices(
    ancestorEntries,
    currentEntries,
  );
  const historicalParts = new Set(
    currentEntries
      .filter((_entry, index) => historicalEntryIndices.has(index))
      .map((entry) => `${entry.messageIndex}:${entry.partIndex}`),
  );

  return messages.flatMap((message, messageIndex) => {
    const parts = message.parts.filter(
      (_part, partIndex) =>
        !historicalParts.has(`${messageIndex}:${partIndex}`),
    );
    return parts.length > 0 ? [{ ...message, parts }] : [];
  });
}
