import { FileIcon } from "lucide-react";
import { assertUnreachable } from "@langfuse/shared";
import {
  type FilePart,
  type ReasoningPart,
} from "@langfuse/shared/src/utils/normalized-io";

import { type SessionTimelineConversationMessage } from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/fns/processTimelineMessages";
import { SessionTimelineCollapsiblePart } from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/components/SessionTimelineCollapsiblePart/SessionTimelineCollapsiblePart";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { getSafeImageUrl, getSafeLinkUrl } from "@/src/components/ui/safe-url";

function SessionTimelineReasoning({ part }: { part: ReasoningPart }) {
  const content = part.content;

  if (content.kind === "text") {
    return (
      <SessionTimelineCollapsiblePart
        label="Reasoning"
        variant="plain"
        alignment="row"
      >
        <MarkdownView markdown={content.text} className="px-0 py-0" />
      </SessionTimelineCollapsiblePart>
    );
  }

  if (content.kind === "data") {
    return (
      <SessionTimelineCollapsiblePart
        label="Reasoning data"
        variant="plain"
        alignment="row"
      >
        <PrettyJsonView json={content.value} currentView="pretty" />
      </SessionTimelineCollapsiblePart>
    );
  }

  return (
    <SessionTimelineCollapsiblePart
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
    </SessionTimelineCollapsiblePart>
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

export function SessionTimelinePart({
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
