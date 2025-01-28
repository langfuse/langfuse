import { capitalize } from "lodash";
import { GripVertical, MinusCircleIcon } from "lucide-react";
import { type ChangeEvent, useEffect, useState, useRef } from "react";
import { ChatMessageRole, type ChatMessageWithId } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Textarea } from "@/src/components/ui/textarea";
import type { MessagesContext } from "./types";
import { useSortable } from "@dnd-kit/sortable";
import { cn } from "@/src/utils/tailwind";
import { CSS } from "@dnd-kit/utilities";

type ChatMessageProps = Pick<
  MessagesContext,
  "deleteMessage" | "updateMessage" | "availableRoles"
> & { message: ChatMessageWithId; index: number };

export const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  updateMessage,
  deleteMessage,
  availableRoles,
  index,
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [textAreaRows, setTextAreaRows] = useState(1);
  const [roleIndex, setRoleIndex] = useState(1);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: message.id });

  const toggleRole = () => {
    // if user has set custom roles, available roles will be non-empty and we toggle through custom and default roles (assistant, user)
    if (!!availableRoles && Boolean(availableRoles.length)) {
      let randomRole = availableRoles[roleIndex % availableRoles.length];
      if (randomRole === message.role) {
        randomRole = availableRoles[(roleIndex + 1) % availableRoles.length];
      }
      updateMessage(message.id, "role", randomRole);
      setRoleIndex(roleIndex + 1);
    } else {
      // if user has not set custom roles, we toggle through default roles (assistant, user)
      updateMessage(
        message.id,
        "role",
        message.role === ChatMessageRole.User
          ? ChatMessageRole.Assistant
          : message.role === ChatMessageRole.Assistant && index === 0
            ? ChatMessageRole.System
            : ChatMessageRole.User,
      );
    }
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
    <Card
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        isDragging ? "opacity-80" : "opacity-100",
        "group relative whitespace-nowrap p-3",
      )}
    >
      {message.role !== ChatMessageRole.System && (
        <div
          {...attributes}
          {...listeners}
          className="absolute bottom-0 left-0 top-4 flex w-6 cursor-move justify-center"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <CardContent className="ml-4 flex flex-row space-x-1 p-0">
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
          className="height-[auto] min-h-6 w-full font-mono text-xs focus:outline-none"
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
