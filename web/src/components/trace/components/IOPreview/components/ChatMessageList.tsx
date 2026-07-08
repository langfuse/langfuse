import { Fragment, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  filterAlreadyRenderedMedia,
  getRenderedInlineMediaIds,
} from "@/src/components/ui/markdown-media.utils";
import { ChatMessage, type ViewMode } from "./ChatMessage";
import { SectionMedia } from "./SectionMedia";
import { type ChatMlMessage, shouldRenderMessage } from "./chat-message-utils";
import { type MediaReturnType } from "@/src/features/media/validation";

const COLLAPSE_THRESHOLD = 3;

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
}

/**
 * ChatMessageList renders a list of ChatML messages with collapse/expand.
 *
 * Features:
 * - Filters out empty messages
 * - Collapses long history (shows first + last N messages)
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
}: ChatMessageListProps) {
  // Filter messages to only those with renderable content
  const messagesToRender = useMemo(
    () => messages.filter(shouldRenderMessage),
    [messages],
  );

  // Initialize collapsed state based on message count
  const [isCollapsed, setCollapsed] = useState<boolean | null>(
    collapseLongHistory && messagesToRender.length > COLLAPSE_THRESHOLD
      ? true
      : null,
  );

  const visibleMessages = useMemo(
    () =>
      messagesToRender
        .map((message, originalIndex) => ({ message, originalIndex }))
        .filter(
          ({ originalIndex }) =>
            !isCollapsed ||
            originalIndex === 0 ||
            originalIndex > messagesToRender.length - COLLAPSE_THRESHOLD,
        ),
    [isCollapsed, messagesToRender],
  );

  const remainingMedia = useMemo(() => {
    if (!shouldRenderMarkdown) {
      return media ?? [];
    }

    const renderedMediaIds = new Set<string>();

    visibleMessages.forEach(({ message }) => {
      const content = message.content;

      // Queue previews reliably render standalone media tags in strings and
      // output audio inline, but OpenAI content-part images still fall back to
      // the shared media strip on this surface.
      if (typeof content === "string") {
        getRenderedInlineMediaIds({
          markdown: content,
          audio: message.audio,
        }).forEach((mediaId) => renderedMediaIds.add(mediaId));
        return;
      }

      if (message.audio) {
        getRenderedInlineMediaIds({
          markdown: "",
          audio: message.audio,
        }).forEach((mediaId) => renderedMediaIds.add(mediaId));
      }
    });

    return filterAlreadyRenderedMedia(media, renderedMediaIds);
  }, [media, shouldRenderMarkdown, visibleMessages]);

  return (
    <div className="flex max-h-full min-h-0 flex-col gap-2">
      <div className="flex max-h-full min-h-0 flex-col gap-2">
        <div className="flex flex-col gap-2">
          {visibleMessages.map(({ message, originalIndex }) => (
            <Fragment key={originalIndex}>
              <ChatMessage
                message={message}
                shouldRenderMarkdown={shouldRenderMarkdown}
                currentView={currentView}
                toolCallNumbers={messageToToolCallNumbers.get(originalIndex)}
                isOutputMessage={originalIndex >= (inputMessageCount ?? 0)}
              />
              {/* Show collapse/expand button after first message */}
              {isCollapsed !== null && originalIndex === 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setCollapsed((v) => !v)}
                  className="underline"
                >
                  {isCollapsed
                    ? `Show ${messagesToRender.length - COLLAPSE_THRESHOLD} more ...`
                    : "Hide history"}
                </Button>
              )}
            </Fragment>
          ))}
        </div>

        {/* Additional input section */}
        {additionalInput && (
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

/**
 * OpenAiMessageView - Alias for backwards compatibility.
 * @deprecated Use ChatMessageList instead.
 */
export const OpenAiMessageView = ChatMessageList;
