import { type RouterOutputs } from "@/src/utils/api";
import { groupTranscriptMessages } from "./groupTranscriptMessages";

export function getSessionTranscriptRows(
  transcript: RouterOutputs["events"]["transcriptByTraceId"]["transcript"],
) {
  return (transcript?.threads ?? []).flatMap((thread, threadIndex) => {
    const messages = thread.currentTurn.messages.map((message) => ({
      ...message,
      timing: { startTime: message.startTime, endTime: message.endTime },
    }));
    return groupTranscriptMessages(messages).map((row, rowIndex) => ({
      id: `${threadIndex}:${rowIndex}`,
      threadIndex,
      row,
    }));
  });
}
