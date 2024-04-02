import { v4 as uuidv4 } from "uuid";
import { ChatMessageRole, ChatMessageWithId } from "@langfuse/shared";

export function createEmptyMessage(
  role: ChatMessageRole,
  content?: string,
): ChatMessageWithId {
  return {
    role,
    content: content ?? "",
    id: uuidv4(),
  };
}
