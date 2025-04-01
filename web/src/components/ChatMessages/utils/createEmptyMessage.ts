import { v4 as uuidv4 } from "uuid";
import { type ChatMessage, type ChatMessageWithId } from "@langfuse/shared";

export function createEmptyMessage(message: ChatMessage): ChatMessageWithId {
  return {
    ...message,
    content: message.content ?? "",
    id: uuidv4(),
  };
}
