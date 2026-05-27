"use client";

import { Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { getSafeLinkUrl } from "@/src/components/ui/safe-url";
import { cn } from "@/src/utils/tailwind";

export type InAppAgentMessageRole = "assistant" | "user";

export type InAppAgentMessageContent =
  | { type: "loading"; label?: string }
  | { type: "text"; text: string };

export type InAppAgentMessageProps = {
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent;
};

export function InAppAgentMessage({ role, content }: InAppAgentMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "rounded-2xl px-3.5 py-2.5 text-sm shadow-xs",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-card text-card-foreground border-border border",
      )}
    >
      {content.type === "loading" ? (
        <ThinkingIndicator label={content.label} />
      ) : (
        <MessageText role={role} text={content.text} />
      )}
    </div>
  );
}

function MessageText({
  role,
  text,
}: {
  role: InAppAgentMessageRole;
  text: string;
}) {
  if (role === "user") {
    return <p className="leading-5.5 whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div className="prose prose-sm text-foreground prose-headings:my-2.5 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-1 prose-ol:my-1.5 prose-strong:text-inherit prose-blockquote:my-2.5 prose-pre:my-2.5 prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-table:my-2.5 max-w-none leading-5.5">
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
          a: ({ children, href }) => {
            const safeHref = getSafeLinkUrl(href);

            if (!safeHref) {
              return (
                <span className="text-muted-foreground underline">
                  {children}
                </span>
              );
            }

            return (
              <a href={safeHref} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
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
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
