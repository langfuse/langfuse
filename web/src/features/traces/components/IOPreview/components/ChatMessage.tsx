/* eslint-disable @repo/no-null-render, @typescript-eslint/no-use-before-define */
import { JsonViewController } from "@/src/components/ui/JsonViewController";
import { useMemo, useState } from "react";
import { PrettyJsonViewContent } from "@/src/components/ui/PrettyJsonViewContent";
import { getJsonViewContentKind } from "@/src/components/ui/fns/getJsonViewContentKind";
import { useCollapsibleSystemPrompt } from "@/src/hooks/useCollapsibleSystemPrompt";
import { canRenderContentAsMarkdown } from "@/src/components/ui/MarkdownJsonView";
import {
  MarkdownViewController,
  type MarkdownViewState,
} from "@/src/components/ui/MarkdownViewController";
import { MarkdownViewContent } from "@/src/components/ui/MarkdownViewContent";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { useTheme } from "next-themes";
import { type OpenAIOutputAudioType } from "@langfuse/shared";
import { IOSection, type IOSectionAction } from "@/src/components/ui/IOSection";
import { ToolCallInvocationsView } from "@/src/features/traces/components/ToolCallInvocationsView";
import {
  FoldVertical,
  UnfoldVertical,
  ListChevronsDownUp,
  ListChevronsUpDown,
} from "@langfuse/icons";
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
          <ChatMessageMarkdownSection
            title="Placeholder"
            content={message.name || "Unnamed placeholder"}
            actions={actions}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
          />
        </div>
        <div style={{ display: shouldRenderMarkdown ? "none" : "block" }}>
          <ChatMessageJsonSection
            json={message.name || "Unnamed placeholder"}
            currentView={currentView}
            title="Placeholder"
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
        <ChatMessageJsonSection
          json={message.json}
          currentView={currentView}
          title={sectionTitle}
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
        <ChatMessageJsonSection
          json={message.json}
          currentView="pretty"
          title={sectionTitle}
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
          <ChatMessageMarkdownSection
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
          <ChatMessageJsonSection
            json={message.content}
            currentView={currentView}
            title={sectionTitle}
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
        <ChatMessageJsonSection
          json={withoutUnsetFields(message)}
          currentView={currentView}
          title={sectionTitle}
          actions={actions}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
        />
      </div>
    );
  }

  return null;
}

function ChatMessageMarkdownSection({
  content,
  audio,
  title,
  actions,
  collapsed,
  onCollapsedChange,
  beforeContent,
  afterContent,
  isSystemPrompt,
}: Pick<
  React.ComponentProps<typeof ChatMessageJsonSection>,
  | "title"
  | "actions"
  | "collapsed"
  | "onCollapsedChange"
  | "beforeContent"
  | "afterContent"
  | "isSystemPrompt"
> & { content: unknown; audio?: OpenAIOutputAudioType }) {
  const characterLimit = useMarkdownRenderCharacterLimit();
  const markdownContent = useMemo(
    () =>
      canRenderContentAsMarkdown(content, characterLimit)
        ? { value: content }
        : null,
    [content, characterLimit],
  );

  if (!markdownContent) {
    return (
      <ChatMessageJsonSection
        json={content ?? (audio ? { audio } : null)}
        currentView="pretty"
        title={title}
        actions={actions}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        beforeContent={beforeContent}
        afterContent={afterContent}
        isSystemPrompt={isSystemPrompt}
      />
    );
  }

  return (
    <MarkdownViewController markdown={markdownContent.value} audio={audio}>
      {(state) => (
        <ChatMessageMarkdownSectionContent
          state={state}
          title={title}
          actions={actions}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
          beforeContent={beforeContent}
          afterContent={afterContent}
          isSystemPrompt={isSystemPrompt}
        />
      )}
    </MarkdownViewController>
  );
}

function ChatMessageMarkdownSectionContent({
  state,
  title,
  actions,
  collapsed,
  onCollapsedChange,
  beforeContent,
  afterContent,
  isSystemPrompt,
}: Pick<
  React.ComponentProps<typeof ChatMessageJsonSection>,
  | "title"
  | "actions"
  | "collapsed"
  | "onCollapsedChange"
  | "beforeContent"
  | "afterContent"
  | "isSystemPrompt"
> & { state: MarkdownViewState }) {
  const { forcedTheme, resolvedTheme } = useTheme();
  const systemPrompt = useCollapsibleSystemPrompt({
    isSystemPrompt: isSystemPrompt ?? title === "system",
    content: state.textContent,
  });

  return (
    <IOSection
      key={forcedTheme ?? resolvedTheme}
      title={title}
      onCopy={state.copy}
      actions={actions}
      collapsed={
        systemPrompt.shouldBeCollapsible ? systemPrompt.isCollapsed : collapsed
      }
      onCollapsedChange={
        systemPrompt.shouldBeCollapsible
          ? systemPrompt.toggleCollapsed
          : onCollapsedChange
      }
    >
      {beforeContent}
      <MarkdownViewContent state={state} />
      {afterContent}
    </IOSection>
  );
}

function ChatMessageJsonSection({
  json,
  currentView,
  title,
  actions,
  collapsed,
  onCollapsedChange,
  beforeContent,
  afterContent,
  isSystemPrompt,
}: Pick<
  React.ComponentProps<typeof JsonViewController>,
  "json" | "currentView"
> &
  Pick<
    React.ComponentProps<typeof ChatMessageJsonSectionContent>,
    | "title"
    | "actions"
    | "collapsed"
    | "onCollapsedChange"
    | "beforeContent"
    | "afterContent"
    | "isSystemPrompt"
  >) {
  return (
    <JsonViewController json={json} currentView={currentView}>
      {(state) => (
        <ChatMessageJsonSectionContent
          state={state}
          title={title}
          actions={actions}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
          beforeContent={beforeContent}
          afterContent={afterContent}
          isSystemPrompt={isSystemPrompt}
        />
      )}
    </JsonViewController>
  );
}

function ChatMessageJsonSectionContent({
  state,
  title,
  actions,
  collapsed,
  onCollapsedChange,
  beforeContent,
  afterContent,
  isSystemPrompt = false,
}: {
  state: React.ComponentProps<typeof PrettyJsonViewContent>["state"];
  title: string;
  actions?: IOSectionAction[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  beforeContent?: React.ReactNode;
  afterContent?: React.ReactNode;
  isSystemPrompt?: boolean;
}) {
  const systemPrompt = useCollapsibleSystemPrompt({
    isSystemPrompt:
      isSystemPrompt &&
      getJsonViewContentKind(state) === "markdown" &&
      state.standaloneMediaReferenceStrings.length === 0,
    content: state.markdownContent ?? "",
  });

  return (
    <IOSection
      title={title}
      onCopy={state.copy}
      actions={
        getJsonViewContentKind(state) === "table" && state.hasExpandableRows
          ? [
              {
                icon: state.allRowsExpanded ? FoldVertical : UnfoldVertical,
                label: state.allRowsExpanded
                  ? "Collapse all rows"
                  : "Expand all rows",
                onClick: state.toggleAllRows,
              },
              ...(actions ?? []),
            ]
          : actions
      }
      collapsed={
        systemPrompt.shouldBeCollapsible ? systemPrompt.isCollapsed : collapsed
      }
      onCollapsedChange={
        systemPrompt.shouldBeCollapsible
          ? systemPrompt.toggleCollapsed
          : onCollapsedChange
      }
      variant={getJsonViewContentKind(state) === "table" ? "table" : "text"}
    >
      {beforeContent}
      <PrettyJsonViewContent state={state} title={title} borderless />
      {afterContent}
    </IOSection>
  );
}
