import { ChevronDownIcon, PlusCircleIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessageWithId,
} from "@langfuse/shared";

import { ChatMessageComponent } from "./ChatMessageComponent";

import type { MessagesContext } from "./types";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { isString } from "@/src/utils/types";

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

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (active && over && active.id !== over.id) {
      if (isString(active.id) && isString(over.id)) {
        const newIndex = messages.findIndex((m) => m.id === over.id);
        const oldIndex = messages.findIndex((m) => m.id === active.id);
        if (newIndex < 0 || oldIndex < 0) {
          return;
        }
        // allow any message to be reordered
        const newMessages = arrayMove(messages, oldIndex, newIndex);
        props.setMessages(newMessages);
      }
    }
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-auto scroll-smooth" ref={scrollAreaRef}>
          <div className="flex-1 space-y-2">
            <SortableContext
              items={props.messages.map((message) => message.id)}
              strategy={verticalListSortingStrategy}
            >
              {props.messages.map((message, index) => {
                return (
                  <ChatMessageComponent
                    key={message.id}
                    message={message}
                    index={index}
                    deleteMessage={props.deleteMessage}
                    updateMessage={props.updateMessage}
                    replaceMessage={props.replaceMessage}
                    availableRoles={props.availableRoles}
                    toolCallIds={props.toolCallIds}
                  />
                );
              })}
            </SortableContext>
            <div className="mb-4 py-3">
              <AddMessageButton {...props} />
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
};

type AddMessageButtonProps = Pick<MessagesContext, "messages" | "addMessage">;
const AddMessageButton: React.FC<AddMessageButtonProps> = ({
  messages,
  addMessage,
}) => {
  // Skip placeholder messages when determining last roles
  const lastMessageWithRole = messages
    .slice()
    .reverse()
    .find(
      (msg): msg is ChatMessageWithId & { role: string } =>
        msg.type !== ChatMessageType.Placeholder,
    );
  const lastMessageRole = lastMessageWithRole?.role;
  const nextMessageRole =
    lastMessageRole === ChatMessageRole.User
      ? ChatMessageRole.Assistant
      : ChatMessageRole.User;

  const addRegularMessage = () => {
    if (nextMessageRole === ChatMessageRole.User) {
      addMessage({
        role: nextMessageRole,
        content: "",
        type: ChatMessageType.User,
      });
    } else {
      addMessage({
        role: nextMessageRole,
        content: "",
        type: ChatMessageType.AssistantText,
      });
    }
  };

  const addMessageWithRole = (role: ChatMessageRole) => {
    switch (role) {
      case ChatMessageRole.User:
        addMessage({
          role: ChatMessageRole.User,
          content: "",
          type: ChatMessageType.User,
        });
        break;
      case ChatMessageRole.Assistant:
        addMessage({
          role: ChatMessageRole.Assistant,
          content: "",
          type: ChatMessageType.AssistantText,
        });
        break;
      case ChatMessageRole.System:
        addMessage({
          role: ChatMessageRole.System,
          content: "",
          type: ChatMessageType.System,
        });
        break;
      case ChatMessageRole.Developer:
        addMessage({
          role: ChatMessageRole.Developer,
          content: "",
          type: ChatMessageType.Developer,
        });
        break;
      case ChatMessageRole.Tool:
        addMessage({
          role: ChatMessageRole.Tool,
          content: "",
          type: ChatMessageType.ToolResult,
          toolCallId: "",
        });
        break;
      default:
        addRegularMessage();
    }
  };

  const addPlaceholderMessage = () => {
    addMessage({
      type: ChatMessageType.Placeholder,
      name: "",
    });
  };

  return (
    <div className="flex gap-2">
      <div className="flex flex-1 gap-0">
        <Button
          type="button"
          variant="outline"
          className="flex-1 rounded-r-none border-r-0"
          onClick={addRegularMessage}
        >
          <PlusCircleIcon size={14} className="mr-2" />
          <p>Message</p>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-l-none border-l px-2"
            >
              <ChevronDownIcon size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => addMessageWithRole(ChatMessageRole.User)}
            >
              User Message
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => addMessageWithRole(ChatMessageRole.Assistant)}
            >
              Assistant Message
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => addMessageWithRole(ChatMessageRole.System)}
            >
              System Message
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => addMessageWithRole(ChatMessageRole.Developer)}
            >
              Developer Message
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => addMessageWithRole(ChatMessageRole.Tool)}
            >
              Tool Message
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={addPlaceholderMessage}
            >
              <PlusCircleIcon size={14} className="mr-2" />
              <p>Placeholder</p>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              Adds a placeholder to inject message pairs, e.g. a message history
              (with &quot;role&quot;, &quot;content&quot; pairs) when compiling
              the message in the SDK.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
