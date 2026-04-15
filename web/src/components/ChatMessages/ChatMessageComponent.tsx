import capitalize from "lodash/capitalize";
import { GripVertical, MinusCircleIcon } from "lucide-react";
import {
  memo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import {
  type ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  type ChatMessageWithId,
  type LLMToolCall,
  type PlaceholderMessage,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { CodeMirrorEditor } from "@/src/components/editor";
import type { MessagesContext } from "./types";
import { useSortable } from "@dnd-kit/sortable";
import { cn } from "@/src/utils/tailwind";
import { CSS } from "@dnd-kit/utilities";
import { ToolCallCard } from "./ToolCallCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useOptionalPlaygroundContext } from "@/src/features/playground/page/context";
import {
  useOptionalMessageSearchActions,
  useOptionalMessageSearchPageId,
} from "./MessageSearch";

type ChatMessageProps = Pick<
  MessagesContext,
  | "deleteMessage"
  | "updateMessage"
  | "availableRoles"
  | "toolCallIds"
  | "replaceMessage"
> & { message: ChatMessageWithId; index: number };

const ROLES: ChatMessageRole[] = [
  ChatMessageRole.User,
  ChatMessageRole.System,
  ChatMessageRole.Developer,
  ChatMessageRole.Assistant,
  ChatMessageRole.Tool,
] as const;

const getRoleNamePlaceholder = (role: string) => {
  switch (role) {
    case ChatMessageRole.System:
      return "a system message";
    case ChatMessageRole.Developer:
      return "a developer message";
    case ChatMessageRole.Assistant:
      return "an assistant message";
    case ChatMessageRole.User:
      return "a user message";
    case ChatMessageRole.Tool:
      return "a tool response message";
    case "placeholder":
      return "placeholder name (e.g. chat_history)";
    default:
      return `a ${role}`;
  }
};

const ToolCalls: React.FC<{ toolCalls: LLMToolCall[] }> = ({ toolCalls }) => {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="w-full space-y-2">
      {toolCalls.map((toolCall) => (
        <ToolCallCard key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  );
};

export const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  updateMessage,
  deleteMessage,
  replaceMessage,
  availableRoles,
  index: _index,
  toolCallIds,
}) => {
  const [roleIndex, setRoleIndex] = useState(1);
  const playgroundContext = useOptionalPlaygroundContext();
  const searchPageId = useOptionalMessageSearchPageId();
  const messageSearchActions = useOptionalMessageSearchActions();
  const pageId = playgroundContext?.windowId ?? searchPageId;
  const registerMessageTarget = messageSearchActions?.registerMessageTarget;
  const unregisterMessageTarget = messageSearchActions?.unregisterMessageTarget;
  const shouldUseMessageSearch = Boolean(
    pageId && registerMessageTarget && unregisterMessageTarget,
  );
  const rowRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: message.id });

  const setCardRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  const toggleRole = () => {
    // Only allow role toggling for messages that have a role property (not placeholder messages)
    if (!("role" in message)) return;

    // if user has set custom roles, available roles will be non-empty and we toggle through custom and default roles (assistant, user)
    if (!!availableRoles && Boolean(availableRoles.length)) {
      let randomRole = availableRoles[roleIndex % availableRoles.length];
      if (randomRole === message.role) {
        randomRole = availableRoles[(roleIndex + 1) % availableRoles.length];
      }
      replaceMessage(message.id, {
        content: message.content,
        role: randomRole,
        type: ChatMessageType.PublicAPICreated,
      });
      setRoleIndex(roleIndex + 1);
    } else {
      // if user has not set custom roles, we toggle through default roles (assistant, user)
      // Allow all roles including system and developer at any position
      const eligibleRoles = ROLES.filter(
        (r) =>
          r !== ChatMessageRole.Tool || (toolCallIds && toolCallIds.length > 0),
      );
      const currentIndex = eligibleRoles.indexOf(
        ("role" in message
          ? message.role
          : ChatMessageRole.User) as ChatMessageRole,
      );
      const nextRole = eligibleRoles[(currentIndex + 1) % eligibleRoles.length];

      if (nextRole === ChatMessageRole.User) {
        replaceMessage(message.id, {
          content: message.content,
          role: nextRole,
          type: ChatMessageType.User,
        });
      } else if (nextRole === ChatMessageRole.Assistant) {
        replaceMessage(message.id, {
          content: message.content,
          role: nextRole,
          type: ChatMessageType.AssistantText,
        });
      } else if (nextRole === ChatMessageRole.Tool) {
        replaceMessage(message.id, {
          content: message.content,
          role: nextRole,
          type: ChatMessageType.ToolResult,
          toolCallId: toolCallIds?.[0] ?? "",
        });
      } else if (nextRole === ChatMessageRole.Developer) {
        replaceMessage(message.id, {
          content: message.content,
          role: nextRole,
          type: ChatMessageType.Developer,
        });
      } else if (nextRole === ChatMessageRole.System) {
        replaceMessage(message.id, {
          content: message.content,
          role: nextRole,
          type: ChatMessageType.System,
        });
      } else if (nextRole === ChatMessageRole.Model) {
        replaceMessage(message.id, {
          content: message.content,
          role: nextRole,
          type: ChatMessageType.ModelText,
        });
      } else {
        const exhaustiveCheck: never = nextRole;
        console.error(`Unhandled role: ${exhaustiveCheck}`);
      }
    }
  };

  const onValueChange = useCallback(
    (value: string) => {
      if (message.type === ChatMessageType.Placeholder) {
        updateMessage(message.type, message.id, "name", value);
      } else {
        updateMessage(message.type, message.id, "content", value);
      }
    },
    [message.id, message.type, updateMessage],
  );

  const onPlaceholderNameChange = useCallback(
    (value: string) => {
      if (message.type === ChatMessageType.Placeholder) {
        updateMessage(message.type, message.id, "name", value);
      }
    },
    [message.id, message.type, updateMessage],
  );

  const showToolCallSelect = message.type === ChatMessageType.ToolResult;
  const isPlaceholder = message.type === ChatMessageType.Placeholder;

  useEffect(() => {
    if (!pageId || !registerMessageTarget || !unregisterMessageTarget) {
      return;
    }

    registerMessageTarget(pageId, message.id, {
      rowRef,
      editorRef,
    });

    return () => {
      unregisterMessageTarget(pageId, message.id);
    };
  }, [
    editorRef,
    message.id,
    pageId,
    registerMessageTarget,
    unregisterMessageTarget,
  ]);

  const handleEditorMount = useCallback(() => {
    if (!pageId || !registerMessageTarget) {
      return;
    }

    registerMessageTarget(pageId, message.id, {
      rowRef,
      editorRef,
    });
  }, [message.id, pageId, registerMessageTarget]);

  return (
    <Card
      ref={setCardRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        isDragging ? "opacity-80" : "opacity-100",
        "group relative border p-1 shadow-2xs transition-shadow duration-200 hover:shadow-xs",
      )}
    >
      <div className="flex flex-row justify-center">
        <div
          {...attributes}
          {...listeners}
          className="flex w-3 cursor-move items-center justify-center opacity-50 transition-opacity hover:opacity-100"
        >
          <GripVertical className="h-3 w-3" />
        </div>
        <CardContent
          className={cn("flex flex-1 flex-row items-center gap-2 p-0 pl-1")}
        >
          <div className="bg-background sticky top-0 bottom-0 z-10 flex w-16 shrink-0 flex-col gap-1">
            {isPlaceholder ? (
              <span className="bg-accent text-muted-foreground inline-flex h-6 w-full items-center justify-center rounded-md px-4 font-mono text-[9px]">
                placeholder
              </span>
            ) : (
              <Button
                onClick={toggleRole}
                type="button"
                variant="ghost"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-6 w-full px-1 py-0 text-[10px] font-semibold"
              >
                {capitalize(message.role)}
              </Button>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex gap-2">
              {showToolCallSelect && (
                <Select
                  value={message.toolCallId}
                  onValueChange={(value) =>
                    updateMessage(
                      ChatMessageType.ToolResult,
                      message.id,
                      "toolCallId",
                      value,
                    )
                  }
                >
                  <SelectTrigger
                    title="Select Tool Call ID"
                    className="bg-muted h-[25px] w-[96px] border-0 text-[9px]"
                  >
                    <SelectValue placeholder="Select Call ID" />
                  </SelectTrigger>
                  <SelectContent>
                    {toolCallIds?.map((id) => (
                      <SelectItem key={id} value={id} className="text-[10px]">
                        {id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isPlaceholder ? (
                <MemoizedEditor
                  value={(message as PlaceholderMessage).name || ""}
                  onChange={onPlaceholderNameChange}
                  role={message.type}
                  editorRef={editorRef}
                  onEditorMount={handleEditorMount}
                  enableSearchKeymap={!shouldUseMessageSearch}
                />
              ) : (
                <MemoizedEditor
                  value={message.content}
                  onChange={onValueChange}
                  role={message.role}
                  editorRef={editorRef}
                  onEditorMount={handleEditorMount}
                  enableSearchKeymap={!shouldUseMessageSearch}
                />
              )}
            </div>
            {message.type === ChatMessageType.AssistantToolCall && (
              <ToolCalls toolCalls={message.toolCalls as LLMToolCall[]} />
            )}
          </div>
          <Button
            variant="ghost"
            type="button"
            size="icon"
            onClick={() => deleteMessage(message.id)}
            className="h-5 w-5 shrink-0 rounded-full p-0 opacity-60 transition-all hover:opacity-100"
            aria-label="Delete message"
          >
            <MinusCircleIcon size={14} />
          </Button>
        </CardContent>
      </div>
    </Card>
  );
};

const MemoizedEditor = memo(function MemoizedEditor(props: {
  value: string;
  role: ChatMessage["role"];
  onChange: (value: string) => void;
  editorRef: RefObject<ReactCodeMirrorRef | null>;
  onEditorMount: () => void;
  enableSearchKeymap: boolean;
}) {
  const {
    value,
    role,
    onChange,
    editorRef,
    onEditorMount,
    enableSearchKeymap,
  } = props;
  const placeholder = `Enter ${getRoleNamePlaceholder(role)} here.`;

  return (
    <CodeMirrorEditor
      value={value}
      onChange={onChange}
      mode="prompt"
      className="w-full rounded-md border-0"
      editable={true}
      lineNumbers={false}
      placeholder={placeholder}
      editorRef={editorRef}
      enableSearchKeymap={enableSearchKeymap}
      onEditorMount={onEditorMount}
    />
  );
});
