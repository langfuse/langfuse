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
          if (
            value === null ||
            typeof value !== "object" ||
            Array.isArray(value)
          ) {
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
        if (row.type === "message" && parts.length === 0) return [];
        return [
          {
            id: `${threadIndex}:${rowIndex}`,
            threadIndex,
            row: { ...row, message: { ...row.message, parts } },
          },
        ];
      });
    },
  );
}
