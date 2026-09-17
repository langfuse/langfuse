import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";

import { getConversationEntries } from "./getConversationEntries";
import { getHistoricalInputIndices } from "./getHistoricalInputIndices";
import { type SessionTimelineConversationMessage } from "./processTimelineMessages";

export function deduplicateTimelineInput(
  messages: SessionTimelineConversationMessage[],
  ancestorMessages: readonly NormalizedMessage[],
) {
  const historicalParts = new Set(
    (["input", "output"] as const).flatMap((source) => {
      const currentEntries = getConversationEntries(messages, source);
      const ancestorEntries = getConversationEntries(ancestorMessages, source);
      const historicalEntryIndices = getHistoricalInputIndices(
        ancestorEntries,
        currentEntries,
      );

      return currentEntries
        .filter((_entry, index) => historicalEntryIndices.has(index))
        .map((entry) => `${entry.messageIndex}:${entry.partIndex}`);
    }),
  );

  return messages.flatMap((message, messageIndex) => {
    const parts = message.parts.filter(
      (_part, partIndex) =>
        !historicalParts.has(`${messageIndex}:${partIndex}`),
    );
    return parts.length > 0 ? [{ ...message, parts }] : [];
  });
}
