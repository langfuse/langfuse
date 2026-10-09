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
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { ExternalMediaView } from "@/src/components/ui/media/ExternalMediaView";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  classifyMediaValue,
  type MediaDescriptor,
} from "@/src/components/ui/media/mediaUtils";
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
  const content = getSessionTimelineFileContent(part);

  return (
    <div
      className={cn(
        "border-border/70 bg-background flex max-w-full flex-col gap-2 rounded-md border p-3",
        content.kind === "fallback" ? "w-full" : "w-fit",
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-bold">
        <FileIcon className="icon-base" />
        {part.filename ?? part.mediaType ?? "File"}
      </div>
      <SessionTimelineFileBody
        content={content}
        filename={part.filename ?? "Embedded image"}
      />
    </div>
  );
}

type SessionTimelineFileContent =
  | { kind: "langfuse"; reference: string }
  | {
      kind: "s3";
      descriptor: Extract<MediaDescriptor, { kind: "s3" }>;
    }
  | { kind: "image"; url: string }
  | { kind: "link"; url: string; sourceUrl: string }
  | { kind: "fallback"; part: FilePart };

type SessionTimelineFileBodyProps = {
  content: SessionTimelineFileContent;
  filename: string;
};

function getSessionTimelineFileContent(
  part: FilePart,
): SessionTimelineFileContent {
  const source = part.providerMetadata?.source;
  const reference =
    part.content.kind === "reference" &&
    part.mediaType &&
    typeof source === "string"
      ? `@@@langfuseMedia:type=${part.mediaType}|id=${part.content.id}|source=${source}@@@`
      : undefined;

  if (reference) return { kind: "langfuse", reference };
  if (part.content.kind !== "url") return { kind: "fallback", part };

  const classifiedMedia = classifyMediaValue(part.content.url);
  if (classifiedMedia?.kind === "s3") {
    return { kind: "s3", descriptor: classifiedMedia };
  }

  const safeImageUrl = part.mediaType?.startsWith("image/")
    ? getSafeImageUrl(part.content.url)
    : null;
  if (safeImageUrl) return { kind: "image", url: safeImageUrl };

  const safeUrl = getSafeLinkUrl(part.content.url);
  if (safeUrl) {
    return { kind: "link", url: safeUrl, sourceUrl: part.content.url };
  }

  return { kind: "fallback", part };
}

function SessionTimelineFileBody({
  content,
  filename,
}: SessionTimelineFileBodyProps) {
  if (content.kind === "langfuse") {
    return (
      <LangfuseMediaView
        mediaReferenceString={content.reference}
        variant="preview"
      />
    );
  }

  if (content.kind === "s3") {
    return <ExternalMediaView descriptor={content.descriptor} />;
  }

  if (content.kind === "image") {
    return (
      <a href={content.url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content.url}
          alt={filename}
          className="max-h-64 max-w-full rounded-md object-contain"
        />
      </a>
    );
  }

  if (content.kind === "link") {
    return (
      <a
        href={content.url}
        target="_blank"
        rel="noreferrer"
        className="text-primary min-w-0 truncate text-xs underline underline-offset-2"
        title={content.sourceUrl}
      >
        {content.url}
      </a>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <PrettyJsonView json={content.part} currentView="pretty" />
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
