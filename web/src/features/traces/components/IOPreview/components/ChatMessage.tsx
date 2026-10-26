/* eslint-disable @repo/no-null-render */
import { useState } from "react";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { IOSection, type IOSectionAction } from "@/src/components/ui/IOSection";
import { ToolCallInvocationsView } from "@/src/features/traces/components/ToolCallInvocationsView";
import { ListChevronsDownUp, ListChevronsUpDown } from "@langfuse/icons";
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
import { ThinkingBlock } from "../../ThinkingBlock";
import { RedactedThinkingBlock } from "../../RedactedThinkingBlock";
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
  /** Section title; the caller decides (role, name, or Input / Output). */
  title: string;
  /** Extra header actions, after the message's own. */
  actions?: IOSectionAction[];
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
  title,
  actions: extraActions,
}: ChatMessageProps) {
  const [showTableView, setShowTableView] = useState(false);
  // The section's collapsed state lives here, so switching between the
  // formatted and passthrough views keeps what the user set.
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  // Role-less messages still get a header (and with it their actions).
  const sectionTitle = title || (isOutputMessage ? "Output" : "Input");

  const renderToolResponse = (response: ChatMlMessage) => (
    <ChatMessage
      message={response}
      title={getMessageTitle(response)}
      shouldRenderMarkdown={shouldRenderMarkdown}
      currentView={currentView}
      contentMode={contentMode}
    />
  );

  const toolCalls = parseToolCallsFromMessage(message);
  const hasContent = hasRenderableContent(message);
  // Collapse from the raw role: the title is the message `name` when present,
  // so name-bearing system prompts would otherwise never collapse.
  const isSystemPrompt = message.role === "system";
  const showData = contentMode !== "conversation";

  // Toggle between the formatted message and its passthrough JSON
  const passthroughAction: IOSectionAction | undefined =
    showData && hasPassthroughJson(message)
      ? {
          icon: showTableView ? ListChevronsDownUp : ListChevronsUpDown,
          label: showTableView
            ? "Show formatted view"
            : "Show passthrough JSON data",
          onClick: () => setShowTableView((v) => !v),
          active: showTableView,
        }
      : undefined;
  const allActions = [
    ...(passthroughAction ? [passthroughAction] : []),
    ...(extraActions ?? []),
  ];
  const actions = allActions.length > 0 ? allActions : undefined;

  // A collapsed message mounts only its header: the formatted and JSON views
  // (and their parsing) wait until it is expanded.
  if (collapsed) {
    return (
      <div className="transition-colors">
        <IOSection
          title={sectionTitle}
          collapsed
          onCollapsedChange={setCollapsed}
        >
          {null}
        </IOSection>
      </div>
    );
  }

  // Placeholder message
  if (isPlaceholderMessage(message)) {
    return (
      <div className="transition-colors">
        <div style={{ display: shouldRenderMarkdown ? "block" : "none" }}>
          <MarkdownJsonView
            title="Placeholder"
            content={message.name || "Unnamed placeholder"}
            actions={actions}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
          />
        </div>
        <div style={{ display: shouldRenderMarkdown ? "none" : "block" }}>
          <PrettyJsonView
            title="Placeholder"
            json={message.name || "Unnamed placeholder"}
            currentView={currentView}
            actions={actions}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
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
          title={sectionTitle}
          json={message.json}
          currentView={currentView}
          actions={actions}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
        />
      </div>
    );
  }

  // User toggled to show passthrough JSON
  if (showTableView) {
    return (
      <div className="transition-colors">
        <PrettyJsonView
          title={sectionTitle}
          json={message.json}
          currentView="pretty"
          actions={actions}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
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
        title={sectionTitle}
        onCopy={() => {
          // Shared stringify (not raw JSON.stringify) so \uXXXX escapes in
          // string fields are copied as real characters, like the rendered
          // view shows them.
          const rawText = stringify(message, undefined, 2);
          copyTextToClipboard(rawText);
        }}
        actions={actions}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
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
            title={sectionTitle}
            content={message.content || ""}
            audio={message.audio}
            actions={actions}
            beforeContent={thinkingBlocks}
            afterContent={toolCallsView}
            isSystemPrompt={isSystemPrompt}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
          />
        </div>

        {/* JSON view */}
        <div style={{ display: shouldRenderMarkdown ? "none" : "block" }}>
          <PrettyJsonView
            title={sectionTitle}
            json={message.content}
            currentView={currentView}
            actions={actions}
            beforeContent={thinkingBlocks}
            afterContent={toolCallsView}
            isSystemPrompt={isSystemPrompt}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
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
          title={sectionTitle}
          json={withoutUnsetFields(message)}
          currentView={currentView}
          actions={actions}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
        />
      </div>
    );
  }

  return null;
}
