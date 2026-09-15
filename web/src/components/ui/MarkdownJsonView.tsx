/* eslint-disable @repo/no-style-props */
import {
  OpenAIContentSchema,
  type OpenAIOutputAudioType,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { type MediaReturnType } from "@/src/features/media/validation";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { type z } from "zod";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { cn } from "@/src/utils/tailwind";

type MarkdownJsonViewHeaderProps = {
  title: string | React.ReactNode;
  titleIcon?: React.ReactNode;
  handleOnValueChange: () => void;
  handleOnCopy: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  canEnableMarkdown?: boolean;
  controlButtons?: React.ReactNode;
  /** When set, the header hosts expand/collapse so a long body is not the
      only place to find the control. */
  collapseControl?: {
    isCollapsed: boolean;
    onToggle: () => void;
  };
  inset?: boolean;
};

export function MarkdownJsonViewHeader({
  title,
  titleIcon,
  handleOnValueChange: _handleOnValueChange,
  handleOnCopy,
  canEnableMarkdown: _canEnableMarkdown = true,
  controlButtons,
  collapseControl,
  inset = false,
}: MarkdownJsonViewHeaderProps) {
  const [isCopied, setIsCopied] = useState(false);
  const collapseLabel = collapseControl
    ? collapseControl.isCollapsed
      ? "Expand system prompt"
      : "Collapse system prompt"
    : undefined;
  // Keep the visible title in the title-button name (WCAG 2.5.3). A generic
  // aria-label would hide message `name`s from assistive tech.
  const titleButtonLabel =
    typeof title === "string" && collapseLabel
      ? `${title}, ${collapseLabel}`
      : collapseLabel;

  const titleContent = (
    <>
      {collapseControl ? (
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            collapseControl.isCollapsed && "-rotate-90",
          )}
          aria-hidden
        />
      ) : null}
      {titleIcon}
      {title}
    </>
  );

  return (
    <div
      className={cn(
        "io-message-header group-hover:bg-muted/80 flex flex-row items-center justify-between py-1 text-sm font-bold capitalize transition-colors",
        inset ? "px-2" : "px-1",
      )}
    >
      {/* Masked from session recordings: the title can be a customer-provided
          message `name` (or tool name) rather than a fixed role string. */}
      <div className="ph-no-capture flex items-center gap-2">
        {collapseControl ? (
          <button
            type="button"
            onClick={collapseControl.onToggle}
            aria-expanded={!collapseControl.isCollapsed}
            aria-label={titleButtonLabel}
            className="hover:text-foreground/80 flex items-center gap-1.5"
          >
            {titleContent}
          </button>
        ) : (
          titleContent
        )}
      </div>
      <div className="mr-1 flex min-w-0 shrink flex-row items-center gap-1">
        {collapseControl ? (
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={collapseControl.onToggle}
            aria-label={collapseLabel}
            className="text-muted-foreground hover:bg-border w-fit text-xs"
          >
            {collapseControl.isCollapsed ? "Expand" : "Collapse"}
          </Button>
        ) : null}
        {controlButtons}
        <Button
          title="Copy to clipboard"
          variant="ghost"
          size="icon-xs"
          type="button"
          onClick={(event) => {
            setIsCopied(true);
            handleOnCopy(event);
            setTimeout(() => setIsCopied(false), 1000);
          }}
          className="hover:bg-border -mr-2"
        >
          {isCopied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
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
  OpenAIContentSchema.safeParse(content).success &&
  // Don't render if markdown content is huge
  JSON.stringify(content || {}).length <= characterLimit;

// MarkdownJsonView will render markdown if `isMarkdownEnabled` (global context) is true and the content is valid markdown
// otherwise, if content is valid markdown will render JSON with switch to enable markdown globally
export function MarkdownJsonView({
  content,
  title,
  titleIcon,
  className,
  audio,
  media,
  controlButtons,
  afterHeader,
  isSystemPrompt,
}: {
  content?: unknown;
  title?: string;
  titleIcon?: React.ReactNode;
  className?: string;
  audio?: OpenAIOutputAudioType;
  media?: MediaReturnType[];
  controlButtons?: React.ReactNode;
  /** Content to render between header and main content (e.g., thinking blocks) */
  afterHeader?: React.ReactNode;
  /** Collapse long content to a preview (from raw `role === "system"`, since
      the title can carry a message `name` instead of the role). */
  isSystemPrompt?: boolean;
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

  return (
    <>
      {markdownContent ? (
        <MarkdownView
          markdown={markdownContent.value}
          title={title}
          titleIcon={titleIcon}
          audio={audio}
          media={media}
          controlButtons={controlButtons}
          afterHeader={afterHeader}
          isSystemPrompt={isSystemPrompt}
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
          afterHeader={afterHeader}
          isSystemPrompt={isSystemPrompt}
        />
      )}
    </>
  );
}
