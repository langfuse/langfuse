import { type ConversationEntry } from "@/src/components/session/components/ConnectedModernSessionBodyTimeline/components/SessionConversationTimeline/fns/getConversationEntries";

export function getHistoricalInputIndices(
  previousContext: ConversationEntry[],
  currentInput: ConversationEntry[],
) {
  const remainingOccurrencesByKey = new Map<string, number>();
  for (const previousEntry of previousContext) {
    remainingOccurrencesByKey.set(
      previousEntry.key,
      (remainingOccurrencesByKey.get(previousEntry.key) ?? 0) + 1,
    );
  }

  const historicalInputIndices = new Set<number>();
  currentInput.forEach((entry, index) => {
    const remainingOccurrences = remainingOccurrencesByKey.get(entry.key) ?? 0;
    if (remainingOccurrences === 0) return;

    historicalInputIndices.add(index);
    remainingOccurrencesByKey.set(entry.key, remainingOccurrences - 1);
  });

  return historicalInputIndices;
}
