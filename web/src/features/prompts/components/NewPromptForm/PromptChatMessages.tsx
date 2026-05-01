import { useEffect, useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { PlusIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ChatMessages } from "@/src/components/ChatMessages";
import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import {
  ChatMessageRole,
  ChatMessageDefaultRoleSchema,
  type ChatMessageWithId,
  PromptChatMessageListSchema,
  ChatMessageType,
} from "@langfuse/shared";

import { type NewPromptFormSchemaType } from "./validation";
import { PromptSelectionDialog } from "../PromptSelectionDialog";
import {
  MessageSearchPageProvider,
  MessageSearchProvider,
  MessageSearchToolbar,
  useSyncMessageSearchMessages,
} from "@/src/components/ChatMessages/MessageSearch";

import type { ControllerRenderProps } from "react-hook-form";
import type { MessagesContext } from "@/src/components/ChatMessages/types";

type PromptChatMessagesProps = ControllerRenderProps<
  NewPromptFormSchemaType,
  "chatPrompt"
> & { initialMessages: unknown; projectId: string | undefined };

const PROMPT_CHAT_MESSAGES_SEARCH_PAGE_ID = "prompt-chat-messages";

const PromptChatMessagesSearchSync = ({
  messages,
}: {
  messages: ChatMessageWithId[];
}) => {
  useSyncMessageSearchMessages(PROMPT_CHAT_MESSAGES_SEARCH_PAGE_ID, messages);

  return null;
};

export const PromptChatMessages: React.FC<PromptChatMessagesProps> = ({
  onChange,
  initialMessages,
  projectId,
}) => {
  const searchRootRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessageWithId[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const parsedMessages =
      PromptChatMessageListSchema.safeParse(initialMessages);

    if (!parsedMessages.success || !parsedMessages.data.length) {
      setMessages([
        createEmptyMessage({
          type: ChatMessageType.System,
          role: ChatMessageRole.System,
          content: "",
        }),
      ]);

      return;
    }

    setMessages(
      parsedMessages.data.map((message) => {
        const id = uuidv4();
        // TODO: clean up - Placeholder messages could also be API created..
        if ("type" in message && message.type === ChatMessageType.Placeholder) {
          return {
            ...message,
            id,
            type: ChatMessageType.Placeholder,
          } as ChatMessageWithId;
        } else {
          return {
            ...message,
            id,
            type: ChatMessageType.PublicAPICreated,
          } as ChatMessageWithId;
        }
      }),
    );

    const customRoles = parsedMessages.data.reduce((acc, message) => {
      if ("role" in message) {
        const { role } = message;
        if (ChatMessageDefaultRoleSchema.safeParse(role).error) {
          acc.add(role);
        }
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

  const addMessage: MessagesContext["addMessage"] = useCallback((message) => {
    const newMessage = { ...message, id: uuidv4() };
    setMessages((prev) => [...prev, newMessage]);

    return newMessage;
  }, []);

  const updateMessage: MessagesContext["updateMessage"] = useCallback(
    (type, id, key, value) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id ? { ...message, [key]: value } : message,
        ),
      );
    },
    [],
  );

  const deleteMessage: MessagesContext["deleteMessage"] = useCallback((id) => {
    setMessages((prev) => prev.filter((message) => message.id !== id));
  }, []);

  const replaceMessage: MessagesContext["replaceMessage"] = useCallback(
    (id, message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { id, ...message } : m)),
      );
    },
    [],
  );

  useEffect(() => {
    onChange(messages);
  }, [messages, onChange]);

  return (
    <MessageSearchProvider
      pageIds={[PROMPT_CHAT_MESSAGES_SEARCH_PAGE_ID]}
      captureRootRef={searchRootRef}
    >
      <MessageSearchPageProvider pageId={PROMPT_CHAT_MESSAGES_SEARCH_PAGE_ID}>
        <PromptChatMessagesSearchSync messages={messages} />

        <div ref={searchRootRef}>
          <div className="my-2 flex flex-wrap items-center justify-between gap-2">
            <MessageSearchToolbar />

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="flex items-center gap-1 px-2 py-1"
                onClick={() => setIsDialogOpen(true)}
              >
                <PlusIcon className="h-4 w-4" />
                <span className="text-xs">Add prompt reference</span>
              </Button>

              {projectId && (
                <PromptSelectionDialog
                  isOpen={isDialogOpen}
                  onClose={() => setIsDialogOpen(false)}
                  projectId={projectId}
                />
              )}
            </div>
          </div>

          <ChatMessages
            {...{
              messages,
              addMessage,
              setMessages,
              deleteMessage,
              updateMessage,
              replaceMessage,
              availableRoles,
            }}
          />
        </div>
      </MessageSearchPageProvider>
    </MessageSearchProvider>
  );
};
