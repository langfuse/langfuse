import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { ChatMessages } from "@/src/components/ChatMessages";
import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import {
  ChatMessageRole,
  ChatMessageDefaultRoleSchema,
  type ChatMessageWithId,
  ChatMessageListSchema,
} from "@langfuse/shared";

import { type NewPromptFormSchemaType } from "./validation";

import type { ControllerRenderProps } from "react-hook-form";
import type { MessagesContext } from "@/src/components/ChatMessages/types";

type PromptChatMessagesProps = ControllerRenderProps<
  NewPromptFormSchemaType,
  "chatPrompt"
> & { initialMessages: unknown };

export const PromptChatMessages: React.FC<PromptChatMessagesProps> = ({
  onChange,
  initialMessages,
}) => {
  const [messages, setMessages] = useState<ChatMessageWithId[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);

  useEffect(() => {
    const parsedMessages = ChatMessageListSchema.safeParse(initialMessages);

    if (!parsedMessages.success || !parsedMessages.data.length) {
      setMessages([createEmptyMessage(ChatMessageRole.System)]);

      return;
    }

    setMessages(
      parsedMessages.data.map((message) => ({
        ...message,
        id: uuidv4(),
      })),
    );

    const customRoles = parsedMessages.data.reduce((acc, message) => {
      const { role } = message;
      if (ChatMessageDefaultRoleSchema.safeParse(role).error) {
        acc.add(role);
      }
      return acc;
    }, new Set<string>());
    if (customRoles.size) {
      setAvailableRoles([
        ...customRoles,
        ChatMessageRole.Assistant,
        ChatMessageRole.User,
      ]);
    }
  }, [initialMessages]);

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
    <ChatMessages
      {...{
        messages,
        addMessage,
        setMessages,
        deleteMessage,
        updateMessage,
        availableRoles,
      }}
    />
  );
};
