"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  BotMessageSquare,
  History,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  SendHorizontal,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import {
  InAppAgentMessage,
  type InAppAgentMessageContent,
  type InAppAgentMessageRole,
} from "./InAppAgentMessage";
import type { InAppAgentMessageFeedbackValue } from "@/src/ee/features/in-app-agent/schema";

const AUTO_SCROLL_THRESHOLD_PX = 50;
const SCROLL_DIRECTION_TOLERANCE_PX = 1;
const CONVERSATION_STARTERS = [
  [
    "Get started with Langfuse",
    "Where should I start with setting up Langfuse?",
  ],
  ["Optimize my setup", "What should I improve in my Langfuse setup?"],
  [
    "Find problematic traces",
    "Show me patterns in failed or low-scoring traces.",
  ],
  [
    "Investigate unusual patterns",
    "Are there unusual latency or cost patterns recently?",
  ],
] as const;

function scrollViewportToBottom(viewport: HTMLDivElement | null) {
  if (!viewport) {
    return;
  }

  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior: "auto",
  });
}

export type InAppAgentWindowMessage = {
  id: string;
  runId?: string;
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent;
};

export type InAppAgentWindowConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
};

type InAppAgentWindowCloseButtonProps =
  | {
      showCloseButton: false;
      onClose?: () => void;
    }
  | {
      showCloseButton?: true;
      onClose: () => void;
    };

export type InAppAgentWindowProps = {
  conversations: InAppAgentWindowConversation[];
  error: string | null;
  hasMoreConversations: boolean;
  isHeaderDragHandleEnabled?: boolean;
  isExpanded: boolean;
  isInputDisabled: boolean;
  isLoadingMoreConversations: boolean;
  messages: InAppAgentWindowMessage[];
  onExpandedChange: (isExpanded: boolean) => void;
  onLoadMoreConversations: () => void;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSubmit: (input: string) => boolean | Promise<boolean>;
  onSubmitFeedback: (params: {
    messageId: string;
    runId: string;
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
  selectedConversationId: string | undefined;
  zIndex?: number;
} & InAppAgentWindowCloseButtonProps;

export function InAppAgentWindow(props: InAppAgentWindowProps) {
  const {
    conversations,
    error,
    hasMoreConversations,
    isHeaderDragHandleEnabled = false,
    isExpanded,
    isInputDisabled,
    isLoadingMoreConversations,
    messages,
    onExpandedChange,
    onLoadMoreConversations,
    onNewConversation,
    onSelectConversation,
    onSubmit,
    onSubmitFeedback,
    selectedConversationId,
    zIndex,
  } = props;
  const viewportRef = useRef<HTMLDivElement>(null);
  const isAutoScrollAttachedRef = useRef(true);
  const previousScrollTopRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const hasUserMessage = messages.some((message) => message.role === "user");

  const submitInput = (content: string) => {
    const trimmedContent = content.trim();

    if (!trimmedContent || isInputDisabled) {
      return;
    }

    Promise.resolve(onSubmit(trimmedContent))
      .then((submitted) => {
        if (submitted) {
          isAutoScrollAttachedRef.current = true;

          setInput((currentInput) =>
            currentInput.trim() === trimmedContent ? "" : currentInput,
          );

          window.requestAnimationFrame(() =>
            scrollViewportToBottom(viewportRef.current),
          );
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!isAutoScrollAttachedRef.current) {
      return;
    }

    scrollViewportToBottom(viewportRef.current);
  }, [messages]);

  useEffect(() => {
    isAutoScrollAttachedRef.current = true;
    previousScrollTopRef.current = 0;

    scrollViewportToBottom(viewportRef.current);
  }, [selectedConversationId]);

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [input]);

  return (
    <section
      aria-label="Assistant"
      className="bg-background flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border shadow/5"
    >
      <header
        data-in-app-agent-window-drag-handle={
          isHeaderDragHandleEnabled ? "true" : undefined
        }
        className={cn(
          "bg-header flex min-h-11.25 shrink-0 items-center justify-between gap-2 border-b px-3 py-1",
          isHeaderDragHandleEnabled && "cursor-move touch-none select-none",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="shrink-0 truncate text-sm font-semibold">Assistant</p>
          <span className="text-muted-foreground rounded border px-1.5 py-1 text-xs leading-none font-medium">
            Beta
          </span>
        </div>
        <div
          className="flex shrink-0 items-center gap-0.5"
          data-movable-resizable-panel-ignore-drag="true"
        >
          <Tooltip delayDuration={100} disableHoverableContent>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={onNewConversation}
                disabled={isInputDisabled}
                aria-label="Start new conversation"
              >
                <Plus className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start new conversation</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip delayDuration={100} disableHoverableContent>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    disabled={isInputDisabled}
                    aria-label="Conversation history"
                  >
                    <History className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Conversation history</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              className="max-h-80 w-64 overflow-y-auto"
              style={
                typeof zIndex === "number" ? { zIndex: zIndex + 1 } : undefined
              }
            >
              <DropdownMenuLabel>Recent conversations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {conversations.length === 0 ? (
                <DropdownMenuItem disabled>
                  No conversations yet
                </DropdownMenuItem>
              ) : (
                conversations.map((conversation) => (
                  <DropdownMenuItem
                    key={conversation.id}
                    className={cn(
                      "truncate",
                      conversation.id === selectedConversationId &&
                        "bg-accent text-accent-foreground",
                    )}
                    onSelect={() => onSelectConversation(conversation.id)}
                  >
                    {conversation.title?.trim() || "Untitled conversation"}
                  </DropdownMenuItem>
                ))
              )}
              {hasMoreConversations ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={isLoadingMoreConversations}
                    onSelect={onLoadMoreConversations}
                  >
                    {isLoadingMoreConversations ? "Loading..." : "Load more"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip delayDuration={100} disableHoverableContent>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={isExpanded ? "Collapse window" : "Expand window"}
                onClick={() => onExpandedChange(!isExpanded)}
              >
                {isExpanded ? (
                  <Minimize2 className="size-3" />
                ) : (
                  <Maximize2 className="size-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isExpanded ? "Collapse window" : "Expand window"}
            </TooltipContent>
          </Tooltip>
          {props.showCloseButton !== false ? (
            <Tooltip delayDuration={100} disableHoverableContent>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Minimize assistant"
                  onClick={props.onClose}
                >
                  <Minus className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Minimize assistant</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={viewportRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            const viewport = event.currentTarget;
            const distanceFromBottom =
              viewport.scrollHeight -
              viewport.scrollTop -
              viewport.clientHeight;
            const isNearBottom = distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
            const scrolledUp =
              viewport.scrollTop <
              previousScrollTopRef.current - SCROLL_DIRECTION_TOLERANCE_PX;

            if (scrolledUp && !isNearBottom) {
              isAutoScrollAttachedRef.current = false;
            } else if (isNearBottom) {
              isAutoScrollAttachedRef.current = true;
            }

            previousScrollTopRef.current = viewport.scrollTop;
          }}
        >
          <div
            className={cn(
              "flex h-full w-full flex-col gap-4 py-4",
              isExpanded && "mx-auto max-w-3xl",
              isExpanded ? "px-0" : "px-3",
            )}
          >
            {!hasUserMessage ? (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-2">
                <div>
                  <BotMessageSquare className="text-muted-foreground mx-auto h-8 w-8" />
                </div>
                <p className="text-muted-foreground mt-4 text-sm">
                  Welcome to the Langfuse Assistant
                </p>
                <p className="text-muted-foreground/60 mt-2 max-w-xs text-center text-sm leading-relaxed">
                  I can help you with any questions you have about Langfuse or
                  assist you in exploring your data.
                  <br />
                  What do you want to do?
                </p>
                <div className="mt-6 flex max-w-sm flex-wrap items-center justify-center gap-2">
                  {CONVERSATION_STARTERS.map(([label, message]) => (
                    <button
                      key={label}
                      type="button"
                      className={cn(
                        "bg-card dark:bg-header text-foreground border-border hover:bg-muted/60 border text-[0.775rem] leading-none shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        isExpanded
                          ? "rounded-2xl px-3 py-2"
                          : "rounded-xl px-2 py-1.5",
                      )}
                      disabled={isInputDisabled}
                      onClick={() => submitInput(message)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <ol className="flex w-full flex-col pb-4">
              {messages.map((message, index) => {
                const hasFullWidthContent =
                  message.content.type === "toolGroup" ||
                  message.content.type === "redirectAction";

                const nextUserMessageIndex = messages.findIndex(
                  (nextMessage, nextIndex) =>
                    nextIndex > index && nextMessage.role === "user",
                );
                const nextTurnStartIndex =
                  nextUserMessageIndex === -1
                    ? messages.length
                    : nextUserMessageIndex;
                const isLastMessageOfTurn = messages
                  .slice(index + 1, nextTurnStartIndex)
                  .every((nextMessage) => nextMessage.role !== "assistant");
                const feedbackRunId =
                  message.role === "assistant" &&
                  message.content.type === "text" &&
                  isLastMessageOfTurn
                    ? message.runId
                    : undefined;

                const previousMessage = messages[index - 1];

                return (
                  <li
                    key={message.id}
                    className={cn(
                      (() => {
                        if (index === 0) {
                          return "mt-0";
                        }

                        if (
                          previousMessage?.role === "user" &&
                          message.role !== "user"
                        ) {
                          return "mt-2";
                        }

                        if (
                          previousMessage?.role !== "user" &&
                          message.role === "user"
                        ) {
                          return "mt-6";
                        }

                        return "mt-2";
                      })(),

                      hasFullWidthContent ? "w-full" : "w-fit",
                      message.role === "user"
                        ? "ml-auto max-w-[92%]"
                        : "max-w-full",
                    )}
                  >
                    <InAppAgentMessage
                      role={message.role}
                      content={message.content}
                      isCompact={!isExpanded}
                      isFeedbackDisabled={isInputDisabled}
                      windowZIndex={zIndex}
                      onSubmitFeedback={
                        feedbackRunId
                          ? (params) =>
                              onSubmitFeedback({
                                messageId: message.id,
                                runId: feedbackRunId,
                                ...params,
                              })
                          : undefined
                      }
                    />
                  </li>
                );
              })}
            </ol>

            {error ? (
              <div
                role="alert"
                className={cn(
                  "border-destructive/40 dark:bg-destructive dark:border-destructive-foreground/20 bg-destructive/10 dark:text-destructive-foreground text-destructive rounded-lg border px-2 py-1",
                  isExpanded ? "text-sm" : "text-xs",
                )}
              >
                {error}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "p-1.5",
            isExpanded ? "pt-0" : "bg-header",
            !isExpanded && hasUserMessage && "border-t",
          )}
        >
          <form
            className={cn(
              "relative flex w-full items-end gap-2 rounded-md",
              isExpanded &&
                "mx-auto max-w-3xl cursor-text flex-col border focus-within:ring focus-within:ring-blue-500 focus-within:ring-offset-0",
            )}
            onClick={() => {
              if (isExpanded) {
                inputRef.current?.focus();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              submitInput(input);
            }}
          >
            <textarea
              autoFocus={!isExpanded}
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={isInputDisabled}
              aria-label="Ask the assistant a question"
              placeholder="Ask the assistant a question..."
              rows={1}
              className={cn(
                "bg-background placeholder:text-muted-foreground w-full flex-1 resize-none overflow-y-auto rounded-md text-sm leading-5 disabled:cursor-not-allowed disabled:opacity-60",
                isExpanded
                  ? "max-h-40 min-h-14 border-none ring-0"
                  : "border-input max-h-40 min-h-8 px-3 py-1",
              )}
            />
            {!isExpanded && (
              <Button
                type="submit"
                size="icon"
                className="h-8 w-8 rounded-md border"
                aria-label="Send message"
                disabled={isInputDisabled || !input.trim()}
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            )}

            {isExpanded && (
              <div className="flex w-full justify-end p-1">
                <Button
                  type="submit"
                  className="h-8 w-fit rounded-md px-3"
                  aria-label="Send message"
                  disabled={isInputDisabled || !input.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  Send <SendHorizontal className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
