import { useEffect, useState } from "react";
import type { ControllerRenderProps } from "react-hook-form";
import { ChatMessages } from "@/src/components/ChatMessages";
import { ChatMessageRole } from "@langfuse/shared";
import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import type { MessagesContext } from "@/src/components/ChatMessages/types";
import {
  ChatMessageListSchema,
  type NewPromptFormSchemaType,
} from "./validation";
import { v4 as uuidv4 } from "uuid";

type PromptChatMessagesProps = ControllerRenderProps<
  NewPromptFormSchemaType,
  "chatPrompt"
>;
export const PromptChatMessages: React.FC<PromptChatMessagesProps> = ({
  onChange,
  value,
}) => {
  let initialMessages;
  try {
    if (value.length === 0) throw Error("Empty array");

    initialMessages = ChatMessageListSchema.parse(value).map((message) => ({
      ...message,
      id: uuidv4(),
    }));
  } catch (err) {
    initialMessages = [createEmptyMessage(ChatMessageRole.System)];
  }

  const [messages, setMessages] = useState(initialMessages);

  const addMessage: MessagesContext["addMessage"] = (role, content) => {
    const message = createEmptyMessage(role, content);
    setMessages((prev) => [...prev, message]);

    return message;
  };

  const updateMessage: MessagesContext["updateMessage"] = (id, key, value) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id ? { ...message, [key]: value } : message,
      ),
    );
  };

  const deleteMessage: MessagesContext["deleteMessage"] = (id) => {
    setMessages((prev) => prev.filter((message) => message.id !== id));
  };

  useEffect(() => {
    onChange(messages);
  }, [messages, onChange]);

  return (
    <ChatMessages {...{ messages, addMessage, deleteMessage, updateMessage }} />
  );
};
