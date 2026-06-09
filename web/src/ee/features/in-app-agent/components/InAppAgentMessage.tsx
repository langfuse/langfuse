"use client";

import { Loader2, Wrench } from "lucide-react";
import { Streamdown } from "streamdown";
import { cn } from "@/src/utils/tailwind";
import { useMemo } from "react";

export type InAppAgentMessageRole = "assistant" | "user";

export type InAppAgentMessageContent =
  | { type: "loading"; label?: string }
  | { type: "text"; text: string }
  | {
      type: "toolGroup";
      tools: InAppAgentToolCallContent[];
      isLoading?: boolean;
    };

export type InAppAgentToolCallContent = {
  type: "tool";
  name: string;
  args: string;
  result?: string;
  error?: string;
};

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

  if (content.type === "toolGroup") {
    return (
      <div
        className={cn(
          "bg-card dark:bg-header text-card-foreground border-border rounded-2xl border py-2 shadow-xs",
          isCompact
            ? "rounded-xl py-1 text-[0.775rem]"
            : "rounded-2xl py-1.5 text-sm",
        )}
      >
        <ToolCallGroup
          tools={content.tools}
          isLoading={content.isLoading}
          isCompact={isCompact}
        />
      </div>
    );
  }

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

function ToolCallGroup({
  tools,
  isLoading = false,
  isCompact = false,
}: {
  tools: InAppAgentToolCallContent[];
  isLoading?: boolean;
  isCompact?: boolean;
}) {
  const label = `${isLoading ? "Calling" : "Called"} ${tools.length} ${tools.length === 1 ? "tool" : "tools"}`;

  const paddingX = cn(isCompact ? "px-2.5" : "px-3");
  const iconSize = isCompact ? "size-3" : "size-4";

  return (
    <details className="group/tool-group min-w-0">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 text-xs leading-none font-medium [&::-webkit-details-marker]:hidden",
          paddingX,
        )}
      >
        {isLoading ? (
          <Loader2
            className={cn(
              "text-muted-foreground shrink-0 animate-spin",
              iconSize,
            )}
          />
        ) : (
          <Wrench className={cn("text-muted-foreground shrink-0", iconSize)} />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-muted-foreground text-xs group-open/tool-group:hidden">
          Show
        </span>
        <span className="text-muted-foreground hidden text-xs group-open/tool-group:inline">
          Hide
        </span>
      </summary>
      <div
        className={cn("border-border mt-2 space-y-2 border-t pt-2", paddingX)}
      >
        {tools.map((tool, index) => (
          <div key={`${tool.name}-${index}`} className="rounded-lg">
            <ToolCallDetails tool={tool} />
          </div>
        ))}
      </div>
    </details>
  );
}

function ToolCallDetails({ tool }: { tool: InAppAgentToolCallContent }) {
  const resultLabel = tool.error ? "Error" : "Result";

  return (
    <details className="group/tool min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs leading-none font-medium [&::-webkit-details-marker]:hidden">
        <Wrench className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Used {tool.name}</span>
        <span className="text-muted-foreground text-xs group-open/tool:hidden">
          Show
        </span>
        <span className="text-muted-foreground hidden text-xs group-open/tool:inline">
          Hide
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        <ToolPayload label="Arguments" value={tool.args} />
        {tool.result !== undefined || tool.error !== undefined ? (
          <ToolPayload
            label={resultLabel}
            value={tool.error ?? tool.result ?? ""}
            isError={Boolean(tool.error)}
          />
        ) : null}
      </div>
    </details>
  );
}

function ToolPayload({
  label,
  value,
  isError = false,
}: {
  label: string;
  value: string;
  isError?: boolean;
}) {
  const toolPayload = useMemo(() => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return "{}";
    }

    try {
      return JSON.stringify(JSON.parse(trimmedValue), null, 2);
    } catch {
      return value;
    }
  }, [value]);

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <pre
        className={cn(
          "bg-muted text-muted-foreground max-h-64 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap",
          isError && "text-destructive",
        )}
      >
        {toolPayload}
      </pre>
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
        "prose prose-sm text-foreground prose-strong:text-inherit prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-table:m-0! prose-headings:text-inherit dark:prose-pre:bg-card prose-pre:leading-tight prose-table:border prose-td:p-2 prose-th:p-2 prose-table:bg-muted dark:prose-table:bg-card prose-table:overflow-hidden prose-table:rounded prose-tr:border-b prose-tr:border-border dark:prose-tr:border-border prose-headings:text-sm prose-hr:border-border max-w-none",
        isCompact
          ? "prose-headings:my-2 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-ol:my-1 prose-blockquote:my-2 prose-pre:my-2 prose-table:my-2 prose-th:text-xs prose-hr:my-3 text-[0.775rem] leading-4"
          : "prose-headings:my-2.5 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-1 prose-ol:my-1.5 prose-blockquote:my-2.5 prose-pre:my-2.5 prose-table:my-2.5 prose-th:text-sm prose-hr:my-5 leading-4.5",
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
          hr: ({ children }) => <hr>{children}</hr>,
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          b: ({ children }) => <b>{children}</b>,
          strong: ({ children }) => <strong>{children}</strong>,
          i: ({ children }) => <i>{children}</i>,
          em: ({ children }) => <em>{children}</em>,
          code: ({ children }) => <code>{children}</code>,
          pre: ({ children }) => <pre>{children}</pre>,
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th>{children}</th>,
          td: ({ children }) => <td>{children}</td>,
          table: ({ children }) => <table>{children}</table>,
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
