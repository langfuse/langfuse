/* eslint-disable no-nested-ternary */
import { FileIcon, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SessionTimelineCollapsibleRow } from "../SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";
import { assertUnreachable } from "@langfuse/shared";
import {
  type FilePart,
  type NormalizedMessage,
  type ReasoningPart,
} from "@langfuse/shared/src/utils/normalized-io";
import { SessionTimelineCollapsiblePart } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelinePart/components/SessionTimelineCollapsiblePart/SessionTimelineCollapsiblePart";
import {
  ExternalMediaView,
  LangfuseMediaView,
} from "@/src/components/ui/LangfuseMediaView";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { classifyMediaValue } from "@/src/components/ui/media/mediaUtils";
import { getSafeImageUrl, getSafeLinkUrl } from "@/src/components/ui/safe-url";
import { cn } from "@/src/utils/tailwind";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";

function SessionTimelineReasoning({
  part,
  trailingContent,
}: {
  part: ReasoningPart;
  trailingContent?: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const content = part.content;

  if (content.kind === "encrypted") {
    return (
      <SessionTimelineCollapsibleRow
        label="Encrypted reasoning"
        trailingContent={trailingContent}
      />
    );
  }

  if (content.kind === "text") {
    return (
      <SessionTimelineCollapsibleRow
        label="Reasoning"
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        trailingContent={trailingContent}
      >
        <MarkdownView
          markdown={decodeUnicodeEscapesOnly(content.text, true)}
          className="px-0 py-0"
        />
      </SessionTimelineCollapsibleRow>
    );
  }

  if (content.kind === "data") {
    return (
      <SessionTimelineCollapsibleRow
        label="Reasoning data"
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        trailingContent={trailingContent}
      >
        <PrettyJsonView json={content.value} currentView="pretty" />
      </SessionTimelineCollapsibleRow>
    );
  }

  if (content.kind === "redacted") {
    return (
      <SessionTimelineCollapsibleRow
        label="Redacted reasoning"
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        trailingContent={trailingContent}
      >
        <pre className="text-muted-foreground overflow-hidden font-mono text-xs break-all whitespace-pre-wrap">
          {content.data}
        </pre>
      </SessionTimelineCollapsibleRow>
    );
  }

  return assertUnreachable(content);
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
  const classifiedMedia =
    part.content.kind === "url" ? classifyMediaValue(part.content.url) : null;
  const s3Media = classifiedMedia?.kind === "s3" ? classifiedMedia : null;
  const usesFallback = !reference && !s3Media && !safeImageUrl && !safeUrl;

  return (
    <div
      className={cn(
        "border-border/70 bg-background flex max-w-full flex-col gap-2 rounded-md border p-3",
        usesFallback ? "w-full" : "w-fit",
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-bold">
        <FileIcon className="icon-base" />
        {part.filename ?? part.mediaType ?? "File"}
      </div>
      {reference ? (
        <LangfuseMediaView mediaReferenceString={reference} variant="preview" />
      ) : s3Media ? (
        <ExternalMediaView descriptor={s3Media} />
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
        <div className="min-w-0 overflow-x-auto">
          <PrettyJsonView json={part} currentView="pretty" />
        </div>
      )}
    </div>
  );
}

export function SessionTimelinePart({
  part,
  trailingContent,
}: {
  part: NormalizedMessage["parts"][number];
  trailingContent?: ReactNode;
}) {
  if (part.type === "text") {
    return (
      <div className="flex flex-col gap-1">
        {part.refusal ? (
          <span className="text-dark-red text-[11px] font-bold">Refusal</span>
        ) : null}
        <div data-session-search-content>
          <MarkdownView
            markdown={decodeUnicodeEscapesOnly(part.text, true)}
            className="px-0 py-0"
          />
        </div>
      </div>
    );
  }

  if (part.type === "reasoning") {
    return (
      <SessionTimelineReasoning part={part} trailingContent={trailingContent} />
    );
  }

  if (part.type === "file") {
    return <SessionTimelineFile part={part} />;
  }

  if (part.type === "tool-call" || part.type === "tool-result") {
    const isCall = part.type === "tool-call";
    return (
      <SessionTimelineCollapsiblePart
        label={`${part.toolName ?? "Tool"} · ${isCall ? "Call" : "Result"}`}
        icon={Wrench}
        status={
          part.type === "tool-result" && part.isError ? "error" : undefined
        }
        variant="plain"
        alignment="row"
      >
        <PrettyJsonView
          json={part.type === "tool-call" ? part.input : part.output}
          currentView="pretty"
        />
      </SessionTimelineCollapsiblePart>
    );
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
