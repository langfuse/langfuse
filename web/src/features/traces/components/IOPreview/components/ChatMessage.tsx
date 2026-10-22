/* eslint-disable @repo/no-null-render */
import { useEffect, type ReactNode } from "react";
import { stringify } from "@langfuse/shared";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { ToolCallInvocationsView } from "@/src/features/traces/components/ToolCallInvocationsView";
import {
  type ChatMlMessage,
  hasRenderableContent,
  hasAdditionalData,
  isPlaceholderMessage,
  isOnlyJsonMessage,
  parseToolCallsFromMessage,
  hasThinkingContent,
  hasRedactedThinkingContent,
  withoutUnsetFields,
} from "../../../fns/chatMessageUtils";
import { ThinkingBlock, RedactedThinkingBlock } from "../../ThinkingBlock";
import { type IOPreviewContentMode } from "../IOPreview";

export type ViewMode = "pretty" | "json";

export function ChatMessage({
  message,
  shouldRenderMarkdown,
  currentView,
  toolCallNumbers,
  contentMode = "all",
  showPassthroughJson = false,
  renderResponse,
  borderless,
  expandAllRef,
  onExpandStateChange,
  copyRef,
  onDisplayModeChange,
  onExpandabilityChange,
}: {
  message: ChatMlMessage;
  shouldRenderMarkdown: boolean;
  currentView: ViewMode;
  toolCallNumbers?: number[];
  contentMode?: IOPreviewContentMode;
  showPassthroughJson?: boolean;
  renderResponse?: (response: ChatMlMessage) => ReactNode;
} & Pick<
  React.ComponentProps<typeof PrettyJsonView>,
  | "borderless"
  | "expandAllRef"
  | "onExpandStateChange"
  | "copyRef"
  | "onDisplayModeChange"
  | "onExpandabilityChange"
>) {
  const renderToolResponse =
    renderResponse ??
    ((response: ChatMlMessage) => (
      <ChatMessage
        message={response}
        shouldRenderMarkdown={shouldRenderMarkdown}
        currentView={currentView}
        contentMode={contentMode}
        borderless={borderless}
      />
    ));
  const toolCalls = parseToolCallsFromMessage(message);
  const hasContent = hasRenderableContent(message);
  const hasThinking =
    hasThinkingContent(message) || hasRedactedThinkingContent(message);
  const toolCallsOnly =
    !isPlaceholderMessage(message) &&
    !isOnlyJsonMessage(message) &&
    !showPassthroughJson &&
    !hasContent &&
    !hasThinking &&
    toolCalls.length > 0;
  useEffect(() => {
    if (!toolCallsOnly) return;
    const copy = () => copyTextToClipboard(stringify(message, undefined, 2));
    if (copyRef) copyRef.current = copy;
    onDisplayModeChange?.("text");
    onExpandabilityChange?.(false);
    return () => {
      if (copyRef?.current === copy) copyRef.current = null;
    };
  }, [
    toolCallsOnly,
    message,
    copyRef,
    onDisplayModeChange,
    onExpandabilityChange,
  ]);
  const rendererProps = {
    borderless,
    expandAllRef,
    onExpandStateChange,
    copyRef,
    onDisplayModeChange,
    onExpandabilityChange,
  };

  if (isPlaceholderMessage(message)) {
    const content = message.name || "Unnamed placeholder";
    return shouldRenderMarkdown ? (
      <MarkdownJsonView content={content} {...rendererProps} />
    ) : (
      <PrettyJsonView
        json={content}
        currentView={currentView}
        {...rendererProps}
      />
    );
  }
  if (isOnlyJsonMessage(message) || showPassthroughJson)
    return (
      <PrettyJsonView
        json={message.json}
        currentView={showPassthroughJson ? "pretty" : currentView}
        {...rendererProps}
      />
    );

  if (toolCallsOnly)
    return (
      <ToolCallInvocationsView
        message={message}
        toolCallNumbers={toolCallNumbers}
        renderResponse={renderToolResponse}
      />
    );

  if (hasContent || hasThinking)
    return (
      <>
        {message.thinking?.map((item, index) => (
          <ThinkingBlock
            key={`thinking-${index}`}
            content={item.content}
            summary={item.summary}
          />
        ))}
        {message.redacted_thinking?.map((item, index) => (
          <RedactedThinkingBlock key={`redacted-${index}`} data={item.data} />
        ))}
        {shouldRenderMarkdown ? (
          <MarkdownJsonView
            content={message.content || ""}
            audio={message.audio}
            {...rendererProps}
          />
        ) : (
          <PrettyJsonView
            json={message.content}
            currentView={currentView}
            {...rendererProps}
          />
        )}
        {contentMode !== "conversation" && toolCalls.length > 0 && (
          <ToolCallInvocationsView
            className="mt-2"
            message={message}
            toolCallNumbers={toolCallNumbers}
            renderResponse={renderToolResponse}
          />
        )}
      </>
    );

  if (hasAdditionalData(message))
    return (
      <PrettyJsonView
        json={withoutUnsetFields(message)}
        currentView={currentView}
        {...rendererProps}
      />
    );
  return null;
}
