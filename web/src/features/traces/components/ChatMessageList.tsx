import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "@langfuse/icons";
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
  shouldRenderMessageForContentMode,
} from "@/src/features/traces/fns/chatMessageUtils";
import { type MediaReturnType } from "@/src/features/media";
import { type IOPreviewContentMode } from "@/src/features/traces/components/IOPreview/IOPreview";
import { type IOSectionAction } from "@/src/components/ui/IOSection";

/** Only the last N messages start expanded in a long conversation. */
const EXPANDED_TAIL_LENGTH = 3;
/** Chats longer than this fold everything between the first message and the
    tail behind one "N other messages" row. */
const FOLD_ABOVE_MESSAGES = 6;

function otherMessagesLabel(count: number) {
  return `${count} other ${count === 1 ? "message" : "messages"}`;
}

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
  /** Section title per message; the caller owns the rule. */
  getMessageTitle: (message: ChatMlMessage, side: "input" | "output") => string;
  /** Header actions for the last output-side message (e.g. Correct output). */
  outputActions?: IOSectionAction[];
}

/**
 * ChatMessageList renders a list of ChatML messages, one section each.
 *
 * Features:
 * - Filters out empty messages
 * - Collapses long history: earlier messages start collapsed, and chats with
 *   more than six messages fold them behind one "N other messages" row that
 *   mounts them only when opened
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
  getMessageTitle,
  outputActions,
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

  // Long chats: first message, one row for the rest, then the open tail.
  const foldsMiddle =
    collapseLongHistory && messagesToRender.length > FOLD_ABOVE_MESSAGES;
  const foldEnd = messagesToRender.length - EXPANDED_TAIL_LENGTH;
  const [othersOpen, setOthersOpen] = useState(false);
  const isFolded = (filteredIndex: number) =>
    foldsMiddle && filteredIndex > 0 && filteredIndex < foldEnd;

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
            const folded = isFolded(filteredIndex);
            // Folded messages do not mount (no parsing) until the row opens.
            if (folded && !othersOpen) return null;
            const chatMessage = (
              <ChatMessage
                key={originalIndex}
                message={message}
                title={getMessageTitle(
                  message,
                  isOutputMessage ? "output" : "input",
                )}
                shouldRenderMarkdown={shouldRenderMarkdown}
                currentView={currentView}
                toolCallNumbers={messageToToolCallNumbers.get(originalIndex)}
                isOutputMessage={isOutputMessage}
                contentMode={contentMode}
                defaultCollapsed={
                  foldsMiddle ? folded : startsCollapsed(filteredIndex, message)
                }
                actions={
                  filteredIndex === lastOutputIndex ? outputActions : undefined
                }
              />
            );
            // The row sits right after the first message and stays there.
            if (foldsMiddle && filteredIndex === 0) {
              return (
                <Fragment key={originalIndex}>
                  {chatMessage}
                  <OtherMessagesRow
                    count={foldEnd - 1}
                    open={othersOpen}
                    onToggle={() => setOthersOpen((open) => !open)}
                  />
                </Fragment>
              );
            }
            return chatMessage;
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

/** Collapsed-header lookalike that reveals the folded middle of a long chat. */
function OtherMessagesRow({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const label = otherMessagesLabel(count);
  const Caret = open ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      className="io-message-header text-muted-foreground focus-visible:ring-ring flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
    >
      <Caret size="base" color="default" aria-hidden />
      {label}
    </button>
  );
}
