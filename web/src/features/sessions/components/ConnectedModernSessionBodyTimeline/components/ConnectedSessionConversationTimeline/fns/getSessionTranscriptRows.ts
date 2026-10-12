import type { NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { type RouterOutputs } from "@/src/utils/api";
import { groupTranscriptMessages } from "./groupTranscriptMessages";
import { getSessionTranscriptThreads } from "./getSessionTranscriptThreads";

export function getSessionTranscriptRows(
  transcript: RouterOutputs["events"]["transcriptByTraceId"]["transcript"],
) {
  return getSessionTranscriptThreads(transcript).visibleThreads.flatMap(
    ({ thread, threadIndex }) => {
      const messages = thread.currentTurn.messages.map((message) => ({
        ...message,
        timing: { startTime: message.startTime, endTime: message.endTime },
      }));
      return groupTranscriptMessages(messages).flatMap((row, rowIndex) => {
        const filteredRow = withVisibleParts(row);
        if (
          filteredRow.type === "message" &&
          filteredRow.message.parts.length === 0
        )
          return [];
        return [
          {
            id: `${threadIndex}:${rowIndex}`,
            threadIndex,
            row: filteredRow,
          },
        ];
      });
    },
  );
}

function withVisibleParts<T extends { message: NormalizedMessage }>(row: T): T {
  // TODO: Consider excluding opaque encrypted parts during transcript generation instead.
  const parts = row.message.parts.filter((part) => {
    if (part.type !== "custom") return true;
    if (part.kind === "encrypted_content") {
      return false;
    }
    if (part.kind !== "Microsoft.Extensions.AI.TextReasoningContent") {
      return true;
    }
    const value = part.value;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return true;
    }
    const content = value.content;
    if (
      content === null ||
      typeof content !== "object" ||
      Array.isArray(content)
    ) {
      return true;
    }
    if (
      typeof content.protectedData === "string" &&
      content.protectedData.length > 0
    ) {
      return false;
    }
    return true;
  });
  return { ...row, message: { ...row.message, parts } };
}
