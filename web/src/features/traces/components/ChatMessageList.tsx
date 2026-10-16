import { useMemo } from "react";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  filterAlreadyRenderedMedia,
  getRenderedInlineMediaIds,
} from "@/src/components/ui/markdown-media.utils";
import { canRenderContentAsMarkdown } from "@/src/components/ui/MarkdownJsonView";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import {
  ChatMessage,
  type ViewMode,
} from "@/src/features/traces/components/IOPreview/components/ChatMessage";
import { SectionMedia } from "@/src/features/traces/components/IOPreview/components/SectionMedia";
import {
  type ChatMlMessage,
  getMessageTitle,
  shouldRenderMessageForContentMode,
} from "@/src/features/traces/fns/chatMessageUtils";
import { type MediaReturnType } from "@/src/features/media";
import { type IOPreviewContentMode } from "@/src/features/traces/components/IOPreview/IOPreview";

/** Only the last N messages start expanded in a long conversation. */
const EXPANDED_TAIL_LENGTH = 3;

// ChatMessageList props
export interface ChatMessageListProps {
  messages: ChatMlMessage[];
  shouldRenderMarkdown: boolean;
  media?: MediaReturnType[];
  additionalInput?: Record<string, unknown>;
  currentView: ViewMode;
  messageToToolCallNumbers: Map<number, number[]>;
  collapseLongHistory?: boolean;
  inputMessageCount?: number;
  contentMode?: IOPreviewContentMode;
  showSystemPrompt?: boolean;
  /** Title messages Input / Output by side instead of by role. */
  titleBySide?: boolean;
  /** Header controls for the last output-side message (e.g. Correct output). */
  outputControls?: React.ReactNode;
}

/**
 * ChatMessageList renders a list of ChatML messages, one section each.
 *
 * Features:
 * - Filters out empty messages
 * - Collapses long history (earlier messages start collapsed)
 * - Renders additional input section
 * - Renders media section
 */
export function ChatMessageList({
  messages,
  shouldRenderMarkdown,
  media,
  additionalInput,
  currentView,
  messageToToolCallNumbers,
  collapseLongHistory = true,
  inputMessageCount,
  contentMode = "all",
  showSystemPrompt,
  titleBySide = false,
  outputControls,
}: ChatMessageListProps) {
  // Filter messages to only those with renderable content
  const messagesToRender = useMemo(
    () =>
      messages
        .map((message, originalIndex) => ({ message, originalIndex }))
        .filter(({ message }) =>
          shouldRenderMessageForContentMode(
            message,
            contentMode,
            showSystemPrompt,
          ),
        ),
    [contentMode, messages, showSystemPrompt],
  );

  // System prompts follow their own long-prompt rule, not the history rule.
  const startsCollapsed = (filteredIndex: number, message: ChatMlMessage) =>
    collapseLongHistory &&
    message.role !== "system" &&
    filteredIndex < messagesToRender.length - EXPANDED_TAIL_LENGTH;

  const lastOutputIndex = messagesToRender.reduce(
    (last, { originalIndex }, index) =>
      originalIndex >= (inputMessageCount ?? 0) ? index : last,
    -1,
  );

  const characterLimit = useMarkdownRenderCharacterLimit();

  const remainingMedia = useMemo(() => {
    if (!shouldRenderMarkdown) {
      return media ?? [];
    }

    const renderedMediaIds = new Set<string>();

    messagesToRender.forEach(({ message }) => {
      const content = message.content || "";

      // Only content that ChatMessage renders through MarkdownView shows its
      // media inline; anything falling back to a JSON table still needs the
      // shared strip, so ask the renderer's own predicate.
      if (canRenderContentAsMarkdown(content, characterLimit)) {
        getRenderedInlineMediaIds({
          markdown: content,
          audio: message.audio,
        }).forEach((mediaId) => renderedMediaIds.add(mediaId));
      }
    });

    return filterAlreadyRenderedMedia(media, renderedMediaIds);
  }, [media, shouldRenderMarkdown, messagesToRender, characterLimit]);

  return (
    <div className="flex max-h-full min-h-0 flex-col gap-2">
      <div className="flex max-h-full min-h-0 flex-col gap-2">
        <div className="flex flex-col gap-2">
          {messagesToRender.map(({ message, originalIndex }, filteredIndex) => {
            const isOutputMessage = originalIndex >= (inputMessageCount ?? 0);
            const sideTitle = isOutputMessage ? "Output" : "Input";
            return (
              <ChatMessage
                key={originalIndex}
                message={message}
                title={titleBySide ? sideTitle : getMessageTitle(message)}
                shouldRenderMarkdown={shouldRenderMarkdown}
                currentView={currentView}
                toolCallNumbers={messageToToolCallNumbers.get(originalIndex)}
                isOutputMessage={isOutputMessage}
                contentMode={contentMode}
                defaultCollapsed={startsCollapsed(filteredIndex, message)}
                controlButtons={
                  filteredIndex === lastOutputIndex ? outputControls : undefined
                }
              />
            );
          })}
        </div>

        {/* Additional input section */}
        {contentMode !== "conversation" && additionalInput && (
          <PrettyJsonView
            title="Additional Input"
            json={additionalInput}
            currentView={shouldRenderMarkdown ? "pretty" : "json"}
          />
        )}

        {/* Media section */}
        {remainingMedia.length > 0 && <SectionMedia media={remainingMedia} />}
      </div>
    </div>
  );
}
