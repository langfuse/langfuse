"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  BotMessageSquare,
  History,
  Maximize2,
  Minimize2,
  Plus,
  SendHorizontal,
  X,
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
import { cn } from "@/src/utils/tailwind";
import {
  InAppAgentMessage,
  type InAppAgentMessageContent,
  type InAppAgentMessageRole,
} from "./InAppAgentMessage";
import type { InAppAgentMessageFeedbackValue } from "@/src/ee/features/in-app-agent/schema";

const AUTO_SCROLL_THRESHOLD_PX = 200;

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
  const scrollPositionRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const scrollPosition = scrollPositionRef.current;
    const isNearBottom =
      !scrollPosition ||
      scrollPosition.scrollHeight -
        scrollPosition.scrollTop -
        scrollPosition.clientHeight <=
        AUTO_SCROLL_THRESHOLD_PX;

    if (!isNearBottom) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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
      className={cn(
        "bg-background flex min-w-0 flex-col overflow-hidden rounded-xl border shadow/5",
        isExpanded
          ? "h-full min-h-0 w-full"
          : "h-[min(42rem,calc(100vh-var(--banner-offset)-2rem))] min-h-96 w-[min(28rem,calc(100vw-1rem))]",
      )}
    >
      <header className="bg-header flex min-h-11.25 shrink-0 items-center justify-between gap-2 border-b px-3 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="shrink-0 truncate text-sm font-semibold">Assistant</p>
          <span className="text-muted-foreground rounded border px-1.5 py-1 text-xs leading-none font-medium">
            Beta
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
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
          <DropdownMenu>
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
          {props.showCloseButton !== false ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label="Close assistant"
              onClick={props.onClose}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={viewportRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            const viewport = event.currentTarget;
            scrollPositionRef.current = {
              scrollHeight: viewport.scrollHeight,
              scrollTop: viewport.scrollTop,
              clientHeight: viewport.clientHeight,
            };
          }}
        >
          <div
            className={cn(
              "flex h-full w-full flex-col gap-4 py-4",
              isExpanded && "mx-auto max-w-3xl",
              isExpanded ? "px-0" : "px-3",
            )}
          >
            {messages.length === 0 ? (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
                <div>
                  <BotMessageSquare className="text-muted-foreground mx-auto h-8 w-8" />
                </div>
                <p className="text-muted-foreground mt-4 text-sm">
                  Welcome to the Langfuse Assistant
                </p>
                <p className="text-muted-foreground/60 mt-2 max-w-xs text-center text-sm leading-relaxed">
                  I can help you with any questions you have about Langfuse or
                  assist you in exploring your event data.
                  <br />
                  Just ask me anything!
                </p>
              </div>
            ) : null}

            <ol className="flex w-full flex-col gap-3 pb-4">
              {messages.map((message) => {
                const hasToolContent = message.content.type === "toolGroup";
                const feedbackRunId =
                  message.role === "assistant" &&
                  message.content.type === "text"
                    ? message.runId
                    : undefined;

                return (
                  <li
                    key={message.id}
                    className={cn(
                      "max-w-[92%]",
                      hasToolContent ? "w-full" : "w-fit",
                      message.role === "user" && "ml-auto",
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
          className={cn("p-1.5", isExpanded ? "pt-0" : "bg-header border-t")}
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

              const content = input.trim();

              if (!content || isInputDisabled) {
                return;
              }

              Promise.resolve(onSubmit(content))
                .then((submitted) => {
                  if (submitted) {
                    setInput((currentInput) =>
                      currentInput.trim() === content ? "" : currentInput,
                    );
                  }
                })
                .catch(() => undefined);
            }}
          >
            <textarea
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
              aria-label="Ask about Langfuse"
              placeholder="Ask about Langfuse..."
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
