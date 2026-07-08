import type {
  ChatMessage,
  ChatMessageWithId,
  PlaceholderMessage,
} from "@langfuse/shared";

export type MessagesContext = {
  messages: ChatMessageWithId[];
  addMessage: (message: ChatMessage | PlaceholderMessage) => ChatMessageWithId;
  setMessages: (messages: ChatMessageWithId[]) => void;
  deleteMessage: (id: string) => void;
  updateMessage: <
    T extends ChatMessageWithId["type"],
    Key extends keyof Omit<
      Extract<ChatMessageWithId, { type: T }>,
      "id" | "type"
    >,
    Value = Extract<ChatMessageWithId, { type: T }>[Key],
  >(
    type: T,
    id: string,
    key: Key,
    value: Value,
  ) => void;
  replaceMessage: (id: string, message: ChatMessage) => void;
  availableRoles?: string[]; // Only defined if user has extended default roles (ChatMessageRole) with custom roles via SDK/API
  toolCallIds?: string[];
};
