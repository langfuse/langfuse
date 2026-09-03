import React, { useState } from "react";
import {
  Bot,
  Brain,
  ChevronDown,
  CircleAlert,
  FileIcon,
  Settings2,
  UserRound,
  Wrench,
} from "lucide-react";
import { assertUnreachable } from "@langfuse/shared";
import {
  type FilePart,
  type NormalizedMessage,
  type NormalizedMessagePart,
  type ReasoningPart,
  type ToolCallPart,
  type ToolResultPart,
} from "@langfuse/shared/src/utils/normalized-io";

import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { getSafeLinkUrl } from "@/src/components/ui/safe-url";
import { cn } from "@/src/utils/tailwind";

const rolePresentation = {
  user: {
    label: "User",
    icon: UserRound,
    container: "border-border bg-card",
  },
  assistant: {
    label: "Assistant",
    icon: Bot,
    container: "border-primary/15 bg-accent-light-green/40",
  },
  system: {
    label: "System",
    icon: Settings2,
    container: "border-border bg-muted/35",
  },
  tool: {
    label: "Tool",
    icon: Wrench,
    container: "border-border bg-muted/20",
  },
} satisfies Record<
  NormalizedMessage["role"],
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    container: string;
  }
>;

function CollapsiblePart({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-border/70 overflow-hidden rounded-md border">
      <button
        type="button"
        className="text-muted-foreground hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            !isExpanded && "-rotate-90",
          )}
        />
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
      {isExpanded ? <div className="border-t p-3">{children}</div> : null}
    </div>
  );
}

function SessionTimelineReasoning({ part }: { part: ReasoningPart }) {
  const content = part.content;

  if (content.kind === "text") {
    return (
      <CollapsiblePart label="Reasoning" icon={Brain}>
        <MarkdownView markdown={content.text} className="px-0 py-0" />
      </CollapsiblePart>
    );
  }

  if (content.kind === "data") {
    return (
      <CollapsiblePart label="Reasoning data" icon={Brain}>
        <PrettyJsonView json={content.value} currentView="pretty" />
      </CollapsiblePart>
    );
  }

  return (
    <CollapsiblePart
      label={
        content.kind === "redacted"
          ? "Redacted reasoning"
          : "Encrypted reasoning"
      }
      icon={Brain}
    >
      <pre className="text-muted-foreground overflow-hidden font-mono text-xs break-all whitespace-pre-wrap">
        {content.data}
      </pre>
    </CollapsiblePart>
  );
}

function SessionTimelineToolCall({ part }: { part: ToolCallPart }) {
  return (
    <CollapsiblePart
      label={`${part.invalid ? "Invalid tool call" : "Tool call"}: ${part.toolName}`}
      icon={part.invalid ? CircleAlert : Wrench}
    >
      <div className="flex flex-col gap-3">
        {part.toolCallId ? (
          <span className="text-muted-foreground font-mono text-[11px]">
            {part.toolCallId}
          </span>
        ) : null}
        <PrettyJsonView json={part.input} currentView="pretty" />
      </div>
    </CollapsiblePart>
  );
}

function SessionTimelineToolResult({ part }: { part: ToolResultPart }) {
  return (
    <CollapsiblePart
      label={`${part.isError ? "Tool error" : "Tool result"}${part.toolName ? `: ${part.toolName}` : ""}`}
      icon={part.isError ? CircleAlert : Wrench}
    >
      <PrettyJsonView json={part.output} currentView="pretty" />
    </CollapsiblePart>
  );
}

function SessionTimelineFile({ part }: { part: FilePart }) {
  const source = part.providerMetadata?.source;
  const safeUrl =
    part.content.kind === "url" ? getSafeLinkUrl(part.content.url) : null;
  const reference =
    part.content.kind === "reference" &&
    part.mediaType &&
    typeof source === "string"
      ? `@@@langfuseMedia:type=${part.mediaType}|id=${part.content.id}|source=${source}@@@`
      : undefined;

  return (
    <div className="border-border/70 flex flex-col gap-2 rounded-md border p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-bold">
        <FileIcon className="h-3.5 w-3.5" />
        {part.filename ?? part.mediaType ?? "File"}
      </div>
      {reference ? (
        <LangfuseMediaView mediaReferenceString={reference} variant="preview" />
      ) : safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary min-w-0 truncate text-xs underline underline-offset-2"
          title={part.content.kind === "url" ? part.content.url : undefined}
        >
          {safeUrl}
        </a>
      ) : (
        <PrettyJsonView json={part} currentView="pretty" />
      )}
    </div>
  );
}

function SessionTimelinePart({ part }: { part: NormalizedMessagePart }) {
  if (part.type === "text") {
    return (
      <div className="flex flex-col gap-1">
        {part.refusal ? (
          <span className="text-dark-red text-[11px] font-bold">Refusal</span>
        ) : null}
        <MarkdownView markdown={part.text} className="px-0 py-0" />
      </div>
    );
  }

  if (part.type === "reasoning") {
    return <SessionTimelineReasoning part={part} />;
  }

  if (part.type === "tool-call") {
    return <SessionTimelineToolCall part={part} />;
  }

  if (part.type === "tool-result") {
    return <SessionTimelineToolResult part={part} />;
  }

  if (part.type === "file") {
    return <SessionTimelineFile part={part} />;
  }

  if (part.type === "data") {
    return <PrettyJsonView json={part.value} currentView="pretty" />;
  }

  if (part.type === "custom") {
    return (
      <PrettyJsonView
        title={part.kind}
        json={part.value}
        currentView="pretty"
      />
    );
  }

  return assertUnreachable(part);
}

export function SessionTimelineMessage({
  message,
}: {
  message: NormalizedMessage;
}) {
  const presentation = rolePresentation[message.role];
  const Icon = presentation.icon;

  return (
    <article
      className={cn(
        "ph-no-capture overflow-hidden rounded-lg border",
        presentation.container,
      )}
    >
      <header className="border-border/70 flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span
            className="truncate text-xs font-bold"
            title={message.senderName ?? presentation.label}
          >
            {message.senderName ?? presentation.label}
          </span>
        </div>
        <span className="text-muted-foreground shrink-0 font-mono text-[10px] uppercase">
          {message.source}
        </span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {message.parts.map((part, index) => (
          <SessionTimelinePart key={`${part.type}-${index}`} part={part} />
        ))}
        {message.finishReason ? (
          <span className="text-muted-foreground text-[10px]">
            Finish reason: {message.finishReason.raw}
          </span>
        ) : null}
      </div>
    </article>
  );
}
