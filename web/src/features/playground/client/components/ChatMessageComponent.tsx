import { capitalize } from "lodash";
import { MinusCircleIcon } from "lucide-react";
import { type ChangeEvent, useEffect, useState, useRef } from "react";
import { ChatMessageRole, type ChatMessageWithId } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Textarea } from "@/src/components/ui/textarea";
import { MessagesContext } from "@/src/features/playground/client/components/Messages";

type ChatMessageProps = Pick<
  MessagesContext,
  "deleteMessage" | "updateMessage" | "updatePromptVariables"
> & { message: ChatMessageWithId };

export const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  updateMessage,
  updatePromptVariables,
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
    <Card>
      <CardContent className="flex flex-row space-x-1 pt-6">
        <div className="min-w-[7rem]">
          <Button onClick={toggleRole} variant="outline">
            {capitalize(message.role)}
          </Button>
        </div>

        <Textarea
          ref={textAreaRef}
          className="height-[auto] min-h-10 w-full font-mono focus:outline-none"
          placeholder={placeholder}
          value={message.content}
          onChange={handleContentChange}
          onBlur={updatePromptVariables}
          rows={textAreaRows}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => deleteMessage(message.id)}
          disabled={message.role === ChatMessageRole.System}
        >
          <MinusCircleIcon />
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
