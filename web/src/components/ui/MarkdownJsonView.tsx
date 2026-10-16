/* eslint-disable @repo/no-style-props */
import {
  OpenAIContentParts,
  OpenAIContentSchema,
  type OpenAIOutputAudioType,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { type MediaReturnType } from "@/src/features/media";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { type z } from "zod";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { cn } from "@/src/utils/tailwind";
import { classifyMediaValue } from "@/src/components/ui/media/mediaUtils";

type MarkdownJsonViewHeaderProps = {
  title: string | React.ReactNode;
  titleIcon?: React.ReactNode;
  /** Rendered before the title, e.g. a section caret. */
  leading?: React.ReactNode;
  /** No horizontal padding: the hosting section is flush with the panel. */
  flush?: boolean;
  handleOnCopy?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  controlButtons?: React.ReactNode;
  /** Hosts that render their own copy control (e.g. inside the content box)
      suppress the header's. */
  hideCopyButton?: boolean;
  /** Reveal the right-side controls only while hovering the hosting section
      (requires a `group/iosection` ancestor). */
  hoverRevealControls?: boolean;
  /** Makes the title row (everything but the controls) one toggle button. */
  toggle?: { expanded: boolean; label: string; onToggle: () => void };
  /** Rendered after the title, outside the toggle button (e.g. an info
      tooltip trigger, which may not nest inside a button). */
  titleAside?: React.ReactNode;
};

export function MarkdownJsonViewHeader({
  title,
  titleIcon,
  leading,
  flush = false,
  handleOnCopy,
  controlButtons,
  hideCopyButton = false,
  hoverRevealControls = false,
  toggle,
  titleAside,
}: MarkdownJsonViewHeaderProps) {
  const [isCopied, setIsCopied] = useState(false);

  const titleContent = (
    <>
      {leading}
      {titleIcon}
      {title}
    </>
  );
  // Masked from session recordings: the title can be a customer-provided
  // message `name` (or tool name) rather than a fixed role string.
  const titleRow = toggle ? (
    <>
      <button
        type="button"
        className="ph-no-capture focus-visible:ring-ring flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm text-left capitalize focus-visible:ring-2 focus-visible:outline-hidden"
        aria-expanded={toggle.expanded}
        aria-label={toggle.label}
        onClick={toggle.onToggle}
      >
        {titleContent}
      </button>
      {titleAside}
    </>
  ) : (
    <div className="ph-no-capture flex items-center gap-2">
      {titleContent}
      {titleAside}
    </div>
  );

  return (
    <div
      className={cn(
        "io-message-header flex h-8 flex-row items-center justify-between text-sm font-bold capitalize",
        flush ? "px-0" : "px-1",
      )}
    >
      {titleRow}
      <div
        className={cn(
          "mr-1 flex shrink-0 flex-row items-center gap-1",
          // pointer-coarse: touch devices have no hover, so the controls
          // stay visible there instead of being unreachable.
          hoverRevealControls &&
            "opacity-0 transition-opacity group-hover/iosection:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
        )}
      >
        {controlButtons}
        {!hideCopyButton && (
          <Button
            title="Copy to clipboard"
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={(event) => {
              setIsCopied(true);
              handleOnCopy?.(event);
              setTimeout(() => setIsCopied(false), 1000);
            }}
            className="text-muted-foreground hover:text-foreground hover:bg-transparent"
          >
            {isCopied ? (
              <Check className="icon-base text-icon-foreground" />
            ) : (
              <Copy className="icon-base text-icon-foreground" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Whether `content` renders through MarkdownView (inline text/image/audio
 * parts) rather than as a JSON table. Narrows to the schema's INPUT type:
 * `MediaReferenceStringSchema` transforms `@@@langfuseMedia:…@@@` into a parsed
 * object, and the renderer's own part guards re-validate the untransformed
 * shape — so the raw content is what must reach it (LFE-14815).
 *
 * Exported so callers deduping the media strip against what rendered inline
 * ask the same question the renderer answered.
 */
export const canRenderContentAsMarkdown = (
  content: unknown,
  characterLimit: number,
): content is z.input<typeof OpenAIContentSchema> =>
  (OpenAIContentSchema.safeParse(content).success ||
    isOpenAIContentWithExternalS3Image(content)) &&
  // Don't render if markdown content is huge
  JSON.stringify(content || {}).length <= characterLimit;

const isOpenAIContentWithExternalS3Image = (content: unknown) => {
  if (!Array.isArray(content)) return false;

  let hasExternalS3Image = false;
  const hasOnlyRenderableParts = content.every((part) => {
    if (
      typeof part === "object" &&
      part !== null &&
      part.type === "image_url" &&
      typeof part.image_url === "object" &&
      part.image_url !== null
    ) {
      const descriptor = classifyMediaValue(part.image_url.url);
      if (descriptor?.kind === "s3") {
        hasExternalS3Image = true;
        return true;
      }
    }

    return OpenAIContentParts.safeParse([part]).success;
  });

  return hasExternalS3Image && hasOnlyRenderableParts;
};

// MarkdownJsonView renders markdown whenever the content is valid markdown
// (see canRenderContentAsMarkdown), otherwise it falls back to JSON.
export function MarkdownJsonView({
  content,
  title,
  titleIcon,
  className,
  audio,
  media,
  controlButtons,
  beforeContent,
  afterContent,
  isSystemPrompt,
  defaultCollapsed,
}: {
  content?: unknown;
  title?: string;
  titleIcon?: React.ReactNode;
  className?: string;
  audio?: OpenAIOutputAudioType;
  media?: MediaReturnType[];
  controlButtons?: React.ReactNode;
  /** Rendered inside the section box above the content (e.g. thinking blocks). */
  beforeContent?: React.ReactNode;
  /** Rendered inside the section box below the content (e.g. tool calls). */
  afterContent?: React.ReactNode;
  /** Long system prompts start collapsed (from raw `role === "system"`, since
      the title can carry a message `name` instead of the role). */
  isSystemPrompt?: boolean;
  /** Initial collapsed state of the section; system prompts use their own rule. */
  defaultCollapsed?: boolean;
}) {
  const characterLimit = useMarkdownRenderCharacterLimit();
  // Boxed so a renderable `null` content stays distinguishable from
  // "not renderable as markdown", without re-widening the narrowed type.
  const markdownContent = useMemo(
    () =>
      canRenderContentAsMarkdown(content, characterLimit)
        ? { value: content }
        : null,
    [content, characterLimit],
  );

  return markdownContent ? (
    <MarkdownView
      markdown={markdownContent.value}
      title={title}
      titleIcon={titleIcon}
      audio={audio}
      media={media}
      controlButtons={controlButtons}
      beforeContent={beforeContent}
      afterContent={afterContent}
      isSystemPrompt={isSystemPrompt}
      defaultCollapsed={defaultCollapsed}
    />
  ) : (
    <PrettyJsonView
      json={content ?? (audio ? { audio } : null)}
      title={title}
      titleIcon={titleIcon}
      className={className}
      media={media}
      currentView="pretty"
      controlButtons={controlButtons}
      beforeContent={beforeContent}
      afterContent={afterContent}
      isSystemPrompt={isSystemPrompt}
      defaultCollapsed={defaultCollapsed}
    />
  );
}
