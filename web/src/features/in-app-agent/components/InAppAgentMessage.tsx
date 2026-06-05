"use client";

import { Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { cn } from "@/src/utils/tailwind";

export type InAppAgentMessageRole = "assistant" | "user";

export type InAppAgentMessageContent =
  | { type: "loading"; label?: string }
  | { type: "text"; text: string };

export type InAppAgentMessageProps = {
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent;
  isCompact?: boolean;
};

export function InAppAgentMessage({
  role,
  content,
  isCompact = false,
}: InAppAgentMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "shadow-xs",
        isCompact
          ? "rounded-xl px-2.5 py-1 text-[0.775rem]"
          : "rounded-2xl px-3 py-1.5 text-sm",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-card dark:bg-header text-card-foreground border-border border",
      )}
    >
      {content.type === "loading" ? (
        <ThinkingIndicator label={content.label} isCompact={isCompact} />
      ) : (
        <MessageText role={role} text={content.text} isCompact={isCompact} />
      )}
    </div>
  );
}

function MessageText({
  role,
  text,
  isCompact,
}: {
  role: InAppAgentMessageRole;
  text: string;
  isCompact: boolean;
}) {
  if (role === "user") {
    return (
      <p
        className={cn(
          "whitespace-pre-wrap",
          isCompact ? "leading-4" : "leading-4.5",
        )}
      >
        {text}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "prose prose-sm text-foreground prose-strong:text-inherit prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground max-w-none",
        isCompact
          ? "prose-headings:my-2 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-ol:my-1 prose-blockquote:my-2 prose-pre:my-2 prose-table:my-2 text-[0.775rem] leading-4"
          : "prose-headings:my-2.5 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-1 prose-ol:my-1.5 prose-blockquote:my-2.5 prose-pre:my-2.5 prose-table:my-2.5 leading-4.5",
      )}
    >
      <Streamdown
        // Remove all default classNames so that tailwind's prose styling can be applied without conflicts
        components={{
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h4>{children}</h4>,
          h5: ({ children }) => <h5>{children}</h5>,
          h6: ({ children }) => <h6>{children}</h6>,
          p: ({ children }) => <p>{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          b: ({ children }) => <b>{children}</b>,
          strong: ({ children }) => <strong>{children}</strong>,
          i: ({ children }) => <i>{children}</i>,
          em: ({ children }) => <em>{children}</em>,
          code: ({ children }) => <code>{children}</code>,
          pre: ({ children }) => <pre>{children}</pre>,
        }}
      >
        {text}
      </Streamdown>
    </div>
  );
}

function ThinkingIndicator({
  className,
  label = "Thinking...",
  isCompact = false,
}: {
  className?: string;
  label?: string;
  isCompact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center",
        isCompact ? "gap-1.5 text-[0.775rem]" : "gap-2 text-sm",
        className,
      )}
    >
      <Loader2
        className={cn("animate-spin", isCompact ? "h-3 w-3" : "h-3.5 w-3.5")}
      />
      <span>{label}</span>
    </div>
  );
}
