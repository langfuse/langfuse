"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { PanelRightClose, Plus, SendHorizontal } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  InAppAgentMessage,
  type InAppAgentMessageContent,
  type InAppAgentMessageRole,
} from "./InAppAgentMessage";

const AUTO_SCROLL_THRESHOLD_PX = 200;
const NEW_CONVERSATION_VALUE = "__new__";

export type InAppAgentDrawerMessage = {
  id: string;
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent[];
};

export type InAppAgentDrawerConversation = {
  id: string;
  title: string | null;
  lastMessageAt: Date | null;
  updatedAt: Date;
};

type InAppAgentDrawerCloseButtonProps =
  | {
      showCloseButton: false;
      onClose?: () => void;
    }
  | {
      showCloseButton?: true;
      onClose: () => void;
    };

export type InAppAgentDrawerProps = {
  error: string | null;
  isInputDisabled: boolean;
  messages: InAppAgentDrawerMessage[];
  conversations: InAppAgentDrawerConversation[];
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  selectedConversationId: string | undefined;
  onLoadMoreConversations: () => void;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onSubmit: (input: string) => Promise<boolean>;
} & InAppAgentDrawerCloseButtonProps;

export function InAppAgentDrawer(props: InAppAgentDrawerProps) {
  const {
    conversations,
    error,
    hasMoreConversations,
    isInputDisabled,
    isLoadingMoreConversations,
    messages,
    onLoadMoreConversations,
    onNewConversation,
    onSelectConversation,
    onSubmit,
    selectedConversationId,
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
    <section className="bg-background flex h-full min-w-0 flex-col">
      <header className="bg-background flex h-11.25 shrink-0 items-center justify-between border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">AI Assistant</p>
          </div>
          <Select
            value={selectedConversationId ?? NEW_CONVERSATION_VALUE}
            onValueChange={(value) => {
              if (value === NEW_CONVERSATION_VALUE) {
                onNewConversation();
                return;
              }

              onSelectConversation(value);
            }}
            disabled={isInputDisabled}
          >
            <SelectTrigger
              aria-label="Select agent conversation"
              className="h-8 max-w-52 min-w-0 flex-1"
            >
              <SelectValue placeholder="New conversation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_CONVERSATION_VALUE}>
                New conversation
              </SelectItem>
              {conversations.map((conversation) => (
                <SelectItem key={conversation.id} value={conversation.id}>
                  {conversation.title?.trim() || "Untitled conversation"}
                </SelectItem>
              ))}
              {hasMoreConversations ? (
                <>
                  <SelectSeparator />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-full justify-start rounded-sm px-8 text-sm font-normal"
                    disabled={isLoadingMoreConversations}
                    onClick={(event) => {
                      event.preventDefault();
                      onLoadMoreConversations();
                    }}
                  >
                    {isLoadingMoreConversations ? "Loading..." : "Load more"}
                  </Button>
                </>
              ) : null}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onNewConversation}
            disabled={isInputDisabled}
            aria-label="Start new AI agent conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {props.showCloseButton !== false && (
          <Button
            variant="ghost"
            size="icon"
            onClick={props.onClose}
            aria-label="Close AI agent drawer"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        )}
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
          <div className="flex w-full flex-col gap-4 px-3 py-4">
            {messages.length === 0 ? (
              <div className="border-border rounded-2xl border border-dashed px-4 py-3">
                <p className="text-muted-foreground text-sm">
                  Ask about Langfuse
                </p>
              </div>
            ) : null}

            <ol className="flex w-full flex-col gap-4">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={cn(
                    "w-fit max-w-[92%]",
                    message.role === "user" && "ml-auto",
                  )}
                >
                  <div className="flex w-full">
                    {message.content.map((content, index) => (
                      <InAppAgentMessage
                        key={`${message.id}-${index}`}
                        role={message.role}
                        content={content}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ol>

            {error ? (
              <div
                role="alert"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
              >
                {error}
              </div>
            ) : null}
          </div>
        </div>
        <div className="bg-background border-t p-3">
          <form
            className="flex w-full items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();

              const content = input.trim();

              if (!content || isInputDisabled) {
                return;
              }

              onSubmit(content)
                .then((accepted) => {
                  if (!accepted) {
                    return;
                  }

                  setInput((currentInput) =>
                    currentInput.trim() === content ? "" : currentInput,
                  );
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
              className="bg-background placeholder:text-muted-foreground border-input max-h-40 min-h-10 flex-1 resize-none overflow-y-auto rounded-md px-3 py-2 text-sm leading-5 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 rounded-md"
              aria-label="Send message"
              disabled={isInputDisabled || !input.trim()}
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
