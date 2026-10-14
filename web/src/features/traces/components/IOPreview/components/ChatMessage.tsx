/* eslint-disable @repo/no-null-render */
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { IOSection } from "@/src/components/ui/IOSection";
import { ToolCallInvocationsView } from "@/src/features/traces/components/ToolCallInvocationsView";
import { ListChevronsDownUp, ListChevronsUpDown } from "lucide-react";
import { stringify } from "@langfuse/shared";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  type ChatMlMessage,
  getMessageTitle,
  hasRenderableContent,
  hasAdditionalData,
  hasPassthroughJson,
  isPlaceholderMessage,
  isOnlyJsonMessage,
  parseToolCallsFromMessage,
  hasThinkingContent,
  hasRedactedThinkingContent,
  withoutUnsetFields,
} from "../../../fns/chatMessageUtils";
import { ThinkingBlock, RedactedThinkingBlock } from "../../ThinkingBlock";
import { type IOPreviewContentMode } from "../IOPreview";

// View mode for pretty/json toggle
export type ViewMode = "pretty" | "json";

// ChatMessage props
export interface ChatMessageProps {
  message: ChatMlMessage;
  shouldRenderMarkdown: boolean;
  currentView: ViewMode;
  toolCallNumbers?: number[];
  isOutputMessage?: boolean;
  contentMode?: IOPreviewContentMode;
  /** Render the message section collapsed to its header. */
  defaultCollapsed?: boolean;
}

/**
 * ChatMessage renders a single ChatML message with appropriate view.
 *
 * Handles different message types:
 * - Placeholder messages
 * - JSON-only messages (non-ChatML objects)
 * - Content messages with optional tool calls
 * - Tool-call-only messages (no content)
 */
export function ChatMessage({
  message,
  shouldRenderMarkdown,
  currentView,
  toolCallNumbers,
  isOutputMessage,
  contentMode = "all",
  defaultCollapsed,
}: ChatMessageProps) {
  const [showTableView, setShowTableView] = useState(false);

  const renderToolResponse = (response: ChatMlMessage) => (
    <ChatMessage
      message={response}
      shouldRenderMarkdown={shouldRenderMarkdown}
      currentView={currentView}
      contentMode={contentMode}
    />
  );

  const title = getMessageTitle(message);
  const toolCalls = parseToolCallsFromMessage(message);
  const hasContent = hasRenderableContent(message);
  // Collapse from the raw role: the title is the message `name` when present,
  // so name-bearing system prompts would otherwise never collapse.
  const isSystemPrompt = message.role === "system";
  const showData = contentMode !== "conversation";

  // Toggle button for passthrough JSON
  const passthroughToggleButton =
    showData && hasPassthroughJson(message) ? (
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setShowTableView((v) => !v)}
        title={
          showTableView ? "Show formatted view" : "Show passthrough JSON data"
        }
        className="hover:bg-border -mr-2"
      >
        {showTableView ? (
          <ListChevronsDownUp className="icon-sm text-primary" />
        ) : (
          <ListChevronsUpDown className="icon-sm text-icon-foreground" />
        )}
      </Button>
    ) : undefined;

  // Placeholder message
  if (isPlaceholderMessage(message)) {
    return (
      <div className="transition-colors">
        <div style={{ display: shouldRenderMarkdown ? "block" : "none" }}>
          <MarkdownJsonView
            title="Placeholder"
            content={message.name || "Unnamed placeholder"}
            defaultCollapsed={defaultCollapsed}
          />
        </div>
        <div style={{ display: shouldRenderMarkdown ? "none" : "block" }}>
          <PrettyJsonView
            title="Placeholder"
            json={message.name || "Unnamed placeholder"}
            currentView={currentView}
            defaultCollapsed={defaultCollapsed}
          />
        </div>
      </div>
    );
  }

  // JSON-only message (non-ChatML object)
  if (isOnlyJsonMessage(message)) {
    return (
      <div className="transition-colors">
        <PrettyJsonView
          title={title || (isOutputMessage ? "Output" : "Input")}
          json={message.json}
          currentView={currentView}
          defaultCollapsed={defaultCollapsed}
        />
      </div>
    );
  }

  // User toggled to show passthrough JSON
  if (showTableView) {
    return (
      <div className="transition-colors">
        <PrettyJsonView
          title={title}
          json={message.json}
          currentView="pretty"
          controlButtons={passthroughToggleButton}
          defaultCollapsed={defaultCollapsed}
        />
      </div>
    );
  }

  // Tool-call-only message (no content, no thinking)
  if (
    !hasContent &&
    !hasThinkingContent(message) &&
    !hasRedactedThinkingContent(message) &&
    toolCalls.length > 0
  ) {
    return (
      <IOSection
        title={title}
        onCopy={() => {
          // Shared stringify (not raw JSON.stringify) so \uXXXX escapes in
          // string fields are copied as real characters, like the rendered
          // view shows them.
          const rawText = stringify(message, undefined, 2);
          copyTextToClipboard(rawText);
        }}
        controlButtons={passthroughToggleButton}
        defaultCollapsed={defaultCollapsed}
      >
        <ToolCallInvocationsView
          message={message}
          toolCallNumbers={toolCallNumbers}
          renderResponse={renderToolResponse}
        />
      </IOSection>
    );
  }

  // Content message (with optional tool calls and thinking)
  if (
    hasContent ||
    hasThinkingContent(message) ||
    hasRedactedThinkingContent(message)
  ) {
    // Thinking blocks render at the top of the section box
    const thinkingBlocks = (
      <>
        {hasThinkingContent(message) &&
          message.thinking?.map((t, i) => (
            <ThinkingBlock
              key={`thinking-${i}`}
              content={t.content}
              summary={t.summary}
            />
          ))}
        {hasRedactedThinkingContent(message) &&
          message.redacted_thinking?.map((t, i) => (
            <RedactedThinkingBlock key={`redacted-${i}`} data={t.data} />
          ))}
      </>
    );

    // Tool calls render at the bottom of the same section box
    const toolCallsView =
      showData && toolCalls.length > 0 ? (
        <ToolCallInvocationsView
          className="mt-2"
          message={message}
          toolCallNumbers={toolCallNumbers}
          renderResponse={renderToolResponse}
        />
      ) : undefined;

    return (
      <div className="transition-colors">
        {/* Markdown view */}
        <div style={{ display: shouldRenderMarkdown ? "block" : "none" }}>
          <MarkdownJsonView
            title={title}
            content={message.content || ""}
            audio={message.audio}
            controlButtons={passthroughToggleButton}
            beforeContent={thinkingBlocks}
            afterContent={toolCallsView}
            isSystemPrompt={isSystemPrompt}
            defaultCollapsed={defaultCollapsed}
          />
        </div>

        {/* JSON view */}
        <div style={{ display: shouldRenderMarkdown ? "none" : "block" }}>
          <PrettyJsonView
            title={title}
            json={message.content}
            currentView={currentView}
            controlButtons={passthroughToggleButton}
            beforeContent={thinkingBlocks}
            afterContent={toolCallsView}
            isSystemPrompt={isSystemPrompt}
            defaultCollapsed={defaultCollapsed}
          />
        </div>
      </div>
    );
  }

  // Fallback: message with additional data but no content
  if (hasAdditionalData(message)) {
    return (
      <div className="transition-colors">
        <PrettyJsonView
          title={title || (isOutputMessage ? "Output" : "Input")}
          json={withoutUnsetFields(message)}
          currentView={currentView}
          defaultCollapsed={defaultCollapsed}
        />
      </div>
    );
  }

  return null;
}
