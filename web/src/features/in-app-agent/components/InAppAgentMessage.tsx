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
};

export function InAppAgentMessage({ role, content }: InAppAgentMessageProps) {
  const isUser = role === "user";

  if (content.type === "toolGroup") {
    return (
      <div className="bg-card text-card-foreground border-border rounded-2xl border py-2 text-sm shadow-xs">
        <ToolCallGroup tools={content.tools} isLoading={content.isLoading} />
      </div>
    );
  }

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

function ToolCallGroup({
  tools,
  isLoading = false,
}: {
  tools: InAppAgentToolCallContent[];
  isLoading?: boolean;
}) {
  const label = `${isLoading ? "Calling" : "Called"} ${tools.length} ${tools.length === 1 ? "tool" : "tools"}`;

  return (
    <details className="group/tool-group min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 text-xs leading-none font-medium [&::-webkit-details-marker]:hidden">
        {isLoading ? (
          <Loader2 className="text-muted-foreground h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <Wrench className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-muted-foreground text-xs group-open/tool-group:hidden">
          Show
        </span>
        <span className="text-muted-foreground hidden text-xs group-open/tool-group:inline">
          Hide
        </span>
      </summary>
      <div className="border-border mt-2 space-y-2 border-t px-3.5 pt-2">
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
