import React, { useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  FileIcon,
  Settings2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { assertUnreachable } from "@langfuse/shared";
import {
  type FilePart,
  type ReasoningPart,
} from "@langfuse/shared/src/utils/normalized-io";

import { type SessionTimelineConversationMessage } from "@/src/components/session/SessionConversationTimeline/fns/processTimelineMessages";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { getSafeImageUrl, getSafeLinkUrl } from "@/src/components/ui/safe-url";
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
  SessionTimelineConversationMessage["role"],
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
  alignment,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  status?: "success" | "error";
  variant: "plain" | "card";
  alignment: "start" | "center" | "row";
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        "overflow-hidden",
        (alignment === "center" || alignment === "row") && "w-full",
        variant === "card" &&
          "border-border bg-background/80 w-fit max-w-full rounded-md border px-2",
      )}
    >
      <div className={cn(alignment === "row" && "flex items-center gap-4")}>
        <button
          type="button"
          className={cn(
            "flex max-w-full items-center gap-1.5 py-1 text-left font-mono text-xs transition-colors hover:opacity-80",
            alignment === "row" ? "text-muted-foreground" : "text-foreground",
            alignment === "center" && "mx-auto",
            alignment === "start" ? "font-bold" : "font-normal",
          )}
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
        {alignment === "row" ? (
          <div className="border-border min-w-0 flex-1 border-t border-dashed" />
        ) : null}
      </div>
      {isExpanded ? (
        <div
          className={cn(
            "py-2",
            alignment === "center"
              ? "mx-auto w-fit max-w-full"
              : alignment === "start"
                ? "border-border ml-1.5 border-l pl-4"
                : "w-full",
          )}
        >
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
      <CollapsiblePart label="Reasoning" variant="plain" alignment="row">
        <MarkdownView markdown={content.text} className="px-0 py-0" />
      </CollapsiblePart>
    );
  }

  if (content.kind === "data") {
    return (
      <CollapsiblePart label="Reasoning data" variant="plain" alignment="row">
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
      variant="plain"
      alignment="row"
    >
      <pre className="text-muted-foreground overflow-hidden font-mono text-xs break-all whitespace-pre-wrap">
        {content.data}
      </pre>
    </CollapsiblePart>
  );
}

function SessionTimelineFile({ part }: { part: FilePart }) {
  const source = part.providerMetadata?.source;
  const safeUrl =
    part.content.kind === "url" ? getSafeLinkUrl(part.content.url) : null;
  const safeImageUrl =
    part.content.kind === "url" && part.mediaType?.startsWith("image/")
      ? getSafeImageUrl(part.content.url)
      : null;
  const reference =
    part.content.kind === "reference" &&
    part.mediaType &&
    typeof source === "string"
      ? `@@@langfuseMedia:type=${part.mediaType}|id=${part.content.id}|source=${source}@@@`
      : undefined;

  return (
    <div className="border-border/70 bg-background flex w-fit max-w-full flex-col gap-2 rounded-md border p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-bold">
        <FileIcon className="h-3.5 w-3.5" />
        {part.filename ?? part.mediaType ?? "File"}
      </div>
      {reference ? (
        <LangfuseMediaView mediaReferenceString={reference} variant="preview" />
      ) : safeImageUrl ? (
        <a href={safeImageUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={safeImageUrl}
            alt={part.filename ?? "Embedded image"}
            className="max-h-64 max-w-full rounded-md object-contain"
          />
        </a>
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
  part: SessionTimelineConversationMessage["parts"][number];
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
  message: SessionTimelineConversationMessage;
}) {
  return (
    <div className="ph-no-capture flex w-full">
      <CollapsiblePart
        label={message.senderName ?? "System prompt"}
        variant="plain"
        alignment="row"
      >
        <div className="text-muted-foreground flex flex-col gap-2 text-sm leading-6">
          {message.parts.map((part, index) => (
            <SessionTimelinePart key={`${part.type}-${index}`} part={part} />
          ))}
        </div>
      </CollapsiblePart>
    </div>
  );
}

export function SessionTimelineMessage({
  message,
}: {
  message: SessionTimelineConversationMessage;
}) {
  if (message.role === "system") {
    return <SessionTimelineSystemMessage message={message} />;
  }

  const presentation = rolePresentation[message.role];
  const Icon = presentation.icon;
  const showSender = Boolean(
    message.senderName && message.senderName !== presentation.label,
  );
  type MessagePart = SessionTimelineConversationMessage["parts"][number];
  type ContentPart = Exclude<MessagePart, ReasoningPart>;
  const groups: Array<
    | { type: "reasoning"; parts: ReasoningPart[] }
    | { type: "content"; parts: ContentPart[] }
  > = [];

  for (const part of message.parts) {
    const previousGroup = groups.at(-1);
    if (part.type === "reasoning") {
      if (previousGroup?.type === "reasoning") {
        previousGroup.parts.push(part);
      } else {
        groups.push({ type: "reasoning", parts: [part] });
      }
      continue;
    }

    if (previousGroup?.type === "content") {
      previousGroup.parts.push(part);
    } else {
      groups.push({ type: "content", parts: [part] });
    }
  }

  const firstContentGroupIndex = groups.findIndex(
    (group) => group.type === "content",
  );

  return (
    <div className="ph-no-capture flex w-full flex-col gap-2">
      {groups.map((group, groupIndex) => {
        if (group.type === "reasoning") {
          return (
            <div
              key={`reasoning-${groupIndex}`}
              className="flex w-full flex-col gap-1"
            >
              {group.parts.map((part, partIndex) => (
                <SessionTimelineReasoning
                  key={`${part.content.kind}-${partIndex}`}
                  part={part}
                />
              ))}
            </div>
          );
        }

        return (
          <div
            key={`content-${groupIndex}`}
            className={cn("flex w-full", presentation.wrapper)}
          >
            <article
              className={cn("min-w-0 overflow-hidden", presentation.container)}
            >
              {showSender && groupIndex === firstContentGroupIndex ? (
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
              <div className="flex flex-col gap-2 text-sm leading-6">
                {group.parts.map((part, partIndex) => (
                  <SessionTimelinePart
                    key={`${part.type}-${partIndex}`}
                    part={part}
                  />
                ))}
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}
