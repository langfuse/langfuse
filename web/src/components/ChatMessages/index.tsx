import { PlusCircleIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
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
  const { t } = useTranslation();
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

  const addPlaceholderMessage = () => {
    addMessage({
      type: ChatMessageType.Placeholder,
      name: "",
    });
  };

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={addRegularMessage}
      >
        <PlusCircleIcon size={14} className="mr-2" />
        <p>{t("common.labels.message")}</p>
      </Button>
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
              <p>{t("common.labels.placeholder")}</p>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {t("common.hints.addsPlaceholderToInject")}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
