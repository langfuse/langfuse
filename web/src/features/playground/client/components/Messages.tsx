import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "@/src/features/playground/client/context";
import type { ChatMessageRole, ChatMessageWithId } from "@langfuse/shared";

import { GenerationOutput } from "./GenerationOutput";
import { ChatMessages } from "@/src/features/playground/client/components/ChatMessages";

export type MessagesContext = {
  messages: ChatMessageWithId[];
  addMessage: (role: ChatMessageRole, content?: string) => ChatMessageWithId;
  deleteMessage: (id: string) => void;
  updateMessage: <Key extends keyof ChatMessageWithId>(
    id: string,
    key: Key,
    value: ChatMessageWithId[Key],
  ) => void;
};

export const Messages: React.FC<MessagesContext> = (props) => {
  return (
    <div className="flex h-full flex-col space-y-4 pr-4">
      <p className="font-semibold">Messages</p>
      <ChatMessages {...props} />
      <GenerationOutput />
      <SubmitButton />
    </div>
  );
};

const SubmitButton = () => {
  const { handleSubmit, isStreaming } = usePlaygroundContext();

  return (
    <Button
      variant="default"
      className="h-[88px] w-full space-x-2 py-3"
      onClick={() => {
        handleSubmit().catch((err) => console.error(err));
      }}
      loading={isStreaming}
    >
      <p>Submit ({"\u2318"} + Enter)</p>
    </Button>
  );
};
