import { ChevronDownIcon, PlusCircleIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

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

import {
  ChatMessageComponent,
  type MessageRowRefs,
} from "./ChatMessageComponent";

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
import { useOptionalPlaygroundContext } from "@/src/features/playground/page/context";

type ChatMessagesProps = MessagesContext;
export const ChatMessages: React.FC<ChatMessagesProps> = (props) => {
  const { messages } = props;
  const playgroundContext = useOptionalPlaygroundContext();
  const registerScrollToMessage = playgroundContext?.registerScrollToMessage;

  // Registry of the DOM row + editor refs for each message, keyed by id.
  // Populated by each ChatMessageComponent so that after a new message is
  // appended we can scroll it into view and focus its editor (LFE-6864).
  const rowRefsById = useRef(new Map<string, MessageRowRefs>());

  const registerRow = useCallback((id: string, refs: MessageRowRefs | null) => {
    if (refs) {
      rowRefsById.current.set(id, refs);
    } else {
      rowRefsById.current.delete(id);
    }
  }, []);

  // Scroll the newly added message into view and (by default) focus its editor
  // so the user can type immediately (LFE-6864). Both the row and its CodeMirror
  // editor mount asynchronously, and when the message is added from the dropdown
  // menu the menu's own focus teardown competes with ours over several frames.
  // So rather than guess a fixed delay, retry over a short bounded window until
  // the editor is mounted and actually holds focus (or we give up).
  //
  // Pass focus=false to scroll only, without stealing focus into the new editor
  // — used by programmatic append sites (e.g. GenerationOutput's "Add to
  // messages") where yanking the caret into a fresh editor would be jarring.
  const scrollToMessage = useCallback((id: string, focus = true) => {
    let attempts = 0;
    const maxAttempts = 20; // ~20 animation frames (< ~350ms)

    const attempt = () => {
      const refs = rowRefsById.current.get(id);
      const view = refs?.editorRef.current?.view;

      if (view) {
        refs?.rowRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        if (!focus) return;
        view.focus();
        // The dropdown menu can pull focus back for a frame after closing, so
        // keep retrying until the editor is the active element.
        if (view.hasFocus) return;
      }

      if (attempts++ < maxAttempts) {
        requestAnimationFrame(attempt);
      }
    };

    requestAnimationFrame(attempt);
  }, []);

  // Expose scrollToMessage to the playground context so append sites other than
  // AddMessageButton (e.g. GenerationOutput's "Add to messages") can scroll the
  // newly appended message into view too (LFE-6864). No-op outside the
  // playground (e.g. the New Prompt chat editor), where the context is absent.
  useEffect(() => {
    if (!registerScrollToMessage) return;
    registerScrollToMessage(scrollToMessage);
    return () => {
      registerScrollToMessage(null);
    };
  }, [registerScrollToMessage, scrollToMessage]);

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
        <div className="flex-1 overflow-auto scroll-smooth">
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
                    registerRow={registerRow}
                  />
                );
              })}
            </SortableContext>
            <div className="mb-4 py-3">
              <AddMessageButton {...props} scrollToMessage={scrollToMessage} />
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
};

type AddMessageButtonProps = Pick<
  MessagesContext,
  "messages" | "addMessage"
> & {
  scrollToMessage: (id: string) => void;
};
const AddMessageButton: React.FC<AddMessageButtonProps> = ({
  messages,
  addMessage,
  scrollToMessage,
}) => {
  // Tracks whether the role dropdown is closing because a menu item was
  // selected (vs. Escape / click-outside). Only then do we suppress Radix's
  // focus-return to the trigger, so our scrollToMessage can focus the new
  // editor. On dismissal we let Radix return focus to the trigger button per
  // the WAI-ARIA menu button pattern (LFE-6864).
  const selectedViaItemRef = useRef(false);

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
    const newMessage =
      nextMessageRole === ChatMessageRole.User
        ? addMessage({
            role: nextMessageRole,
            content: "",
            type: ChatMessageType.User,
          })
        : addMessage({
            role: nextMessageRole,
            content: "",
            type: ChatMessageType.AssistantText,
          });
    scrollToMessage(newMessage.id);
  };

  const addMessageWithRole = (role: ChatMessageRole) => {
    // A menu item was selected: keep focus on the editor we're about to focus
    // rather than letting Radix return it to the trigger on close.
    selectedViaItemRef.current = true;
    let newMessage: ChatMessageWithId;
    switch (role) {
      case ChatMessageRole.User:
        newMessage = addMessage({
          role: ChatMessageRole.User,
          content: "",
          type: ChatMessageType.User,
        });
        break;
      case ChatMessageRole.Assistant:
        newMessage = addMessage({
          role: ChatMessageRole.Assistant,
          content: "",
          type: ChatMessageType.AssistantText,
        });
        break;
      case ChatMessageRole.System:
        newMessage = addMessage({
          role: ChatMessageRole.System,
          content: "",
          type: ChatMessageType.System,
        });
        break;
      case ChatMessageRole.Developer:
        newMessage = addMessage({
          role: ChatMessageRole.Developer,
          content: "",
          type: ChatMessageType.Developer,
        });
        break;
      case ChatMessageRole.Tool:
        newMessage = addMessage({
          role: ChatMessageRole.Tool,
          content: "",
          type: ChatMessageType.ToolResult,
          toolCallId: "",
        });
        break;
      default:
        addRegularMessage();
        return;
    }
    scrollToMessage(newMessage.id);
  };

  const addPlaceholderMessage = () => {
    const newMessage = addMessage({
      type: ChatMessageType.Placeholder,
      name: "",
    });
    scrollToMessage(newMessage.id);
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
          <DropdownMenuContent
            align="end"
            // When a menu item was selected, let the newly added message's
            // editor keep focus: without this, Radix restores focus to the
            // trigger button on close, stealing it back from the editor we
            // focus after appending. On Escape / click-outside we leave Radix's
            // default focus-return to the trigger intact so keyboard users
            // aren't dropped onto <body> (WAI-ARIA menu button pattern,
            // LFE-6864).
            onCloseAutoFocus={(event) => {
              if (selectedViaItemRef.current) {
                event.preventDefault();
                selectedViaItemRef.current = false;
              }
            }}
          >
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
