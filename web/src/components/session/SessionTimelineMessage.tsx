import React, { useState } from "react";
import {
  Bot,
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Cog,
  FileIcon,
  Settings2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { assertUnreachable } from "@langfuse/shared";
import {
  type FilePart,
  type NormalizedMessage,
  type NormalizedMessagePart,
  type ReasoningPart,
  type ToolCallPart,
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
    wrapper: "justify-end",
    container: "bg-muted max-w-[min(85%,48rem)] rounded-2xl px-4 py-2.5",
  },
  assistant: {
    label: "Assistant",
    icon: Bot,
    wrapper: "justify-start",
    container: "bg-muted/50 max-w-[min(85%,48rem)] rounded-2xl px-4 py-2.5",
  },
  system: {
    label: "System",
    icon: Settings2,
    wrapper: "justify-start",
    container:
      "border-border bg-muted/25 w-full rounded-lg border border-dashed px-3 py-2",
  },
  tool: {
    label: "Tool",
    icon: Wrench,
    wrapper: "justify-start",
    container: "w-full",
  },
} satisfies Record<
  NormalizedMessage["role"],
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    wrapper: string;
    container: string;
  }
>;

function CollapsiblePart({
  label,
  icon: Icon,
  status,
  variant,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  status?: "success" | "error";
  variant: "plain" | "card";
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        "overflow-hidden",
        variant === "card" &&
          "border-border bg-background/80 w-fit max-w-full rounded-md border px-2",
      )}
    >
      <button
        type="button"
        className="text-foreground flex max-w-full items-center gap-1.5 py-1 text-left font-mono text-xs font-bold transition-colors hover:opacity-80"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
        <span className="truncate" title={label}>
          {label}
        </span>
        {status === "success" ? (
          <Check className="h-3 w-3 shrink-0" aria-label="Succeeded" />
        ) : status === "error" ? (
          <X
            className="text-destructive h-3 w-3 shrink-0"
            aria-label="Failed"
          />
        ) : null}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            !isExpanded && "-rotate-90",
          )}
          aria-hidden="true"
        />
      </button>
      {isExpanded ? (
        <div className="border-border ml-1.5 border-l py-2 pl-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SessionTimelineReasoning({ part }: { part: ReasoningPart }) {
  const content = part.content;

  if (content.kind === "text") {
    return (
      <CollapsiblePart label="Reasoning" icon={Brain} variant="plain">
        <MarkdownView markdown={content.text} className="px-0 py-0" />
      </CollapsiblePart>
    );
  }

  if (content.kind === "data") {
    return (
      <CollapsiblePart label="Reasoning data" icon={Brain} variant="plain">
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
      variant="plain"
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
      label={part.toolName}
      icon={part.invalid ? CircleAlert : Cog}
      status={part.invalid ? "error" : "success"}
      variant="card"
    >
      <div className="flex flex-col gap-3">
        {part.toolCallId ? (
          <span className="text-foreground font-mono text-[11px]">
            {part.toolCallId}
          </span>
        ) : null}
        <PrettyJsonView json={part.input} currentView="pretty" />
      </div>
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

function SessionTimelinePart({
  part,
}: {
  part: Exclude<NormalizedMessagePart, { type: "tool-result" }>;
}) {
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

function SessionTimelineSystemMessage({
  message,
}: {
  message: NormalizedMessage;
}) {
  return (
    <div className="ph-no-capture flex w-full justify-end">
      <CollapsiblePart
        label={message.senderName ?? "System prompt"}
        variant="plain"
      >
        <div className="flex flex-col gap-2 text-sm leading-6">
          {message.parts
            .filter((part) => part.type !== "tool-result")
            .map((part, index) => (
              <SessionTimelinePart key={`${part.type}-${index}`} part={part} />
            ))}
        </div>
      </CollapsiblePart>
    </div>
  );
}

export function SessionTimelineMessage({
  message,
  isTruncated = false,
}: {
  message: NormalizedMessage;
  isTruncated?: boolean;
}) {
  if (message.role === "system") {
    return <SessionTimelineSystemMessage message={message} />;
  }

  const presentation = rolePresentation[message.role];
  const Icon = presentation.icon;
  const showSender = Boolean(
    message.senderName && message.senderName !== presentation.label,
  );

  return (
    <div className={cn("flex w-full", presentation.wrapper)}>
      <article
        className={cn(
          "ph-no-capture min-w-0 overflow-hidden",
          presentation.container,
        )}
      >
        {showSender ? (
          <div className="text-foreground mb-1 flex min-w-0 items-center gap-1.5 font-mono text-[11px]">
            <Icon className="h-3 w-3 shrink-0" />
            <span
              className="text-foreground truncate"
              title={message.senderName ?? presentation.label}
            >
              {message.senderName ?? presentation.label}
            </span>
          </div>
        ) : null}
        {isTruncated ? (
          <div className="text-foreground mb-1 font-mono text-[10px]">
            Content truncated
          </div>
        ) : null}
        <div className="flex flex-col gap-2 text-sm leading-6">
          {message.parts
            .filter((part) => part.type !== "tool-result")
            .map((part, index) => (
              <SessionTimelinePart key={`${part.type}-${index}`} part={part} />
            ))}
        </div>
      </article>
    </div>
  );
}
