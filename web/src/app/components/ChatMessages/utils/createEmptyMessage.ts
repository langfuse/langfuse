import { v4 as uuidv4 } from "uuid";
import {
  type ChatMessage,
  type ChatMessageWithIdNoPlaceholders,
} from "@langfuse/shared";

export function createEmptyMessage(
  message: ChatMessage,
): ChatMessageWithIdNoPlaceholders {
  return {
    ...message,
    content: message.content ?? "",
    id: uuidv4(),
  };
}
