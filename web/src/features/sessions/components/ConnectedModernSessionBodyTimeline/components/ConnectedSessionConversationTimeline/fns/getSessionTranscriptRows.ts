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
        // TODO: Consider excluding encrypted_content during transcript generation instead.
        const parts = row.message.parts.filter((part) => {
          if (part.type === "custom" && part.kind === "encrypted_content") {
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
