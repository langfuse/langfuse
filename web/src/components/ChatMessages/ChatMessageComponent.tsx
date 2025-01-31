import { capitalize } from "lodash";
import { GripVertical, MinusCircleIcon } from "lucide-react";
import { useState } from "react";
import { ChatMessageRole, type ChatMessageWithId } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { CodeMirrorEditor } from "@/src/components/editor";
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

  const placeholder = `Enter ${message.role === ChatMessageRole.User ? "a user" : message.role === ChatMessageRole.System ? "a system" : "an assistant"} message here.`;

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
        <div className="min-w-[5rem]">
          <Button
            onClick={toggleRole}
            type="button" // prevents submitting a form if this button is inside a form
            variant="outline"
            className="px-2 text-xs"
          >
            {capitalize(message.role)}
          </Button>
        </div>
        <CodeMirrorEditor
          value={message.content}
          onChange={(value) => updateMessage(message.id, "content", value)}
          mode="prompt"
          minHeight={30}
          className="w-full"
          editable={true}
          lineNumbers={false}
          placeholder={placeholder}
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
