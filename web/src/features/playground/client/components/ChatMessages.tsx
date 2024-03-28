import { PlusCircleIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ChatMessageComponent } from "@/src/features/playground/client/components/ChatMessageComponent";
import { MessagesContext } from "@/src/features/playground/client/components/Messages";
import { ChatMessageRole } from "@langfuse/shared";
import { useRef, useCallback, useEffect, useState } from "react";

type ChatMessagesProps = MessagesContext;
export const ChatMessages: React.FC<ChatMessagesProps> = (props) => {
  const { messages } = props;
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCount = useRef(0);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (prevMessageCount.current < messages.length && scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
    prevMessageCount.current = messages.length;
  }, [scrollAreaRef, messages.length]);

  return (
    <div className="h-full overflow-auto scroll-smooth" ref={scrollAreaRef}>
      <div className="mb-4 flex-1 space-y-4">
        {props.messages.map((message) => {
          return (
            <ChatMessageComponent {...{ message, ...props }} key={message.id} />
          );
        })}
        <AddMessageButton {...props} />
      </div>
    </div>
  );
};

type AddMessageButtonProps = Pick<MessagesContext, "messages" | "addMessage">;
const AddMessageButton: React.FC<AddMessageButtonProps> = ({
  messages,
  addMessage,
}) => {
  const lastMessageRole = messages[messages.length - 1]?.role;
  const nextMessageRole =
    lastMessageRole === ChatMessageRole.User
      ? ChatMessageRole.Assistant
      : ChatMessageRole.User;

  return (
    <Button
      variant="outline"
      className="w-full space-x-2 py-6"
      onClick={() => addMessage(nextMessageRole)}
    >
      <PlusCircleIcon />
      <p>Add message</p>
    </Button>
  );
};
