import { PlusCircleIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { ChatMessageRole } from "@/src/components/playground/types";
import { Button } from "@/src/components/ui/button";

import { usePlaygroundContext } from "../context";
import { ChatMessageComponent } from "./ChatMessageComponent";
import { GenerationOutput } from "./GenerationOutput";

export const Messages = () => {
  // Keep scrolling the view with the streamed generation
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const { messages } = usePlaygroundContext();
  const latestMessage = messages[messages.length - 1];

  useEffect(() => {
    if (scrollAreaRef.current && latestMessage?.content) {
      const scrollElement = scrollAreaRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [latestMessage?.content]);

  return (
    <div className="flex h-full flex-col space-y-4 pr-4">
      <p className="font-semibold">Messages</p>
      <div className="h-full overflow-auto scroll-smooth" ref={scrollAreaRef}>
        <div className="mb-4 flex-1 space-y-4">
          {messages.map((message) => {
            return <ChatMessageComponent {...{ message }} key={message.id} />;
          })}
          <AddMessageButton />
        </div>
        <div></div>
      </div>
      <GenerationOutput />
      <SubmitButton />
    </div>
  );
};

const AddMessageButton = () => {
  const { addMessage: createMessage, messages } = usePlaygroundContext();
  const lastMessageRole = messages[messages.length - 1]?.role;
  const nextMessageRole =
    lastMessageRole === ChatMessageRole.User
      ? ChatMessageRole.Assistant
      : ChatMessageRole.User;

  return (
    <Button
      variant="outline"
      className="w-full space-x-2 py-6"
      onClick={() => createMessage(nextMessageRole)}
    >
      <PlusCircleIcon />
      <p>Add message</p>
    </Button>
  );
};

const SubmitButton = () => {
  const { handleSubmit, isStreaming } = usePlaygroundContext();

  return (
    <Button
      variant="default"
      className="w-full space-x-2 py-6"
      onClick={() => {
        handleSubmit().catch((err) => console.error(err));
      }}
      loading={isStreaming}
    >
      <p>Submit ({"\u2318"} + Enter)</p>
    </Button>
  );
};
