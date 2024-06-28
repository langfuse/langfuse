import type { ChatMessageRole, ChatMessageWithId } from "@langfuse/shared";


export type MessagesContext = {
  messages: ChatMessageWithId[];
  addMessage: (role: ChatMessageRole, content?: string) => ChatMessageWithId;
  deleteMessage: (id: string) => void;
  updateMessage: <Key extends keyof ChatMessageWithId>(
    id: string,
    key: Key,
    value: ChatMessageWithId[Key]
  ) => void;
};
