import React, { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import type { MetaPromptMessage } from "@/src/features/meta-prompt/types";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";

// Simple markdown wrapper that removes the padding/grid from MarkdownView
const AssistantMarkdown: React.FC<{ content: string }> = ({ content }) => (
  <div className="text-sm [&_.io-message-content]:gap-1 [&_.io-message-content]:p-0">
    <MarkdownView markdown={content} />
  </div>
);

type ChatHistoryProps = {
  chatHistory: MetaPromptMessage[];
  isStreaming: boolean;
};

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  chatHistory,
  isStreaming,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
      {chatHistory.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
          <Bot className="h-8 w-8" />
          <p className="text-sm font-medium">
            What kind of prompt would you like to create?
          </p>
          <p className="text-xs">
            Describe your requirements and I will help you craft a
            well-structured prompt.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {chatHistory.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            isStreamingMessage={
              isStreaming &&
              message.role === "assistant" &&
              message.id === chatHistory[chatHistory.length - 1]?.id
            }
          />
        ))}
      </div>
    </div>
  );
};

type ChatBubbleProps = {
  message: MetaPromptMessage;
  isStreamingMessage: boolean;
};

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isStreamingMessage,
}) => {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : message.content ? (
          <AssistantMarkdown content={message.content} />
        ) : isStreamingMessage ? (
          <div className="flex items-center gap-1 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </div>
        ) : null}
      </div>
    </div>
  );
};
