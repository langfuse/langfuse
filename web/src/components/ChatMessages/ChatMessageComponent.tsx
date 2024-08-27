import { capitalize } from "lodash";
import { MinusCircleIcon } from "lucide-react";
import { type ChangeEvent, useEffect, useState, useRef } from "react";
import { ChatMessageRole, type ChatMessageWithId } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Textarea } from "@/src/components/ui/textarea";
import type { MessagesContext } from "./types";

type ChatMessageProps = Pick<
  MessagesContext,
  "deleteMessage" | "updateMessage"
> & { message: ChatMessageWithId };

export const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  updateMessage,
  deleteMessage,
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [textAreaRows, setTextAreaRows] = useState(1);

  const toggleRole = () => {
    if (message.role === ChatMessageRole.System) return;

    updateMessage(
      message.id,
      "role",
      message.role === ChatMessageRole.User
        ? ChatMessageRole.Assistant
        : ChatMessageRole.User,
    );
  };

  const handleContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    updateMessage(message.id, "content", event.target.value);
  };

  const placeholder = `Enter ${message.role === ChatMessageRole.User ? "a user" : message.role === ChatMessageRole.System ? "a system" : "an assistant"} message here.`;

  useEffect(() => {
    const textAreaWidth = textAreaRef.current?.clientWidth ?? 0;
    const charsPerRow = Math.floor(textAreaWidth / 10);

    setTextAreaRows(
      countContentRows(message.content, charsPerRow || undefined),
    );
  }, [message.content]);

  return (
    <Card className="p-3">
      <CardContent className="flex flex-row space-x-1 p-0">
        <div className="min-w-[6rem]">
          <Button
            onClick={toggleRole}
            type="button" // prevents submitting a form if this button is inside a form
            variant="outline"
            className="text-xs"
          >
            {capitalize(message.role)}
          </Button>
        </div>

        <Textarea
          ref={textAreaRef}
          id={message.id}
          className="height-[auto] min-h-8 w-full pt-3  font-mono text-xs focus:outline-none"
          placeholder={placeholder}
          value={message.content}
          onChange={handleContentChange}
          rows={textAreaRows}
        />
        <Button
          variant="ghost"
          type="button" // prevents submitting a form if this button is inside a form
          size="icon"
          onClick={() => deleteMessage(message.id)}
          disabled={message.role === ChatMessageRole.System}
        >
          <MinusCircleIcon size={16} />
        </Button>
      </CardContent>
    </Card>
  );
};

function countContentRows(str: string, charsPerRow = 80) {
  const lines = str.split("\n");

  const totalRows = lines.reduce((acc, line) => {
    const additionalRows = Math.max(1, Math.ceil(line.length / charsPerRow));

    return acc + additionalRows;
  }, 0);

  return totalRows;
}
