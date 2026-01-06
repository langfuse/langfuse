import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  MarkdownJsonView,
  MarkdownJsonViewHeader,
} from "@/src/components/ui/MarkdownJsonView";
import { ToolCallInvocationsView } from "@/src/components/trace2/components/ToolCallInvocationsView";
import { ListChevronsDownUp, ListChevronsUpDown } from "lucide-react";
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
} from "./chat-message-utils";
import {
  highlightTextWithComments,
  COMMENT_HIGHLIGHT_COLOR,
} from "@/src/components/ui/AdvancedJsonViewer/utils/highlightText";
import { type CommentRange } from "@/src/components/ui/AdvancedJsonViewer/utils/commentRanges";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

// View mode for pretty/json toggle
export type ViewMode = "pretty" | "json";

// ChatMessage props
export interface ChatMessageProps {
  message: ChatMlMessage;
  shouldRenderMarkdown: boolean;
  currentView: ViewMode;
  toolCallNumbers?: number[];
  projectIdForPromptButtons?: string;
  isOutputMessage?: boolean;
  // Inline comment support
  enableInlineComments?: boolean;
  messageIndex?: number;
  sectionKey?: string;
  commentedRanges?: CommentRange[];
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
  projectIdForPromptButtons,
  isOutputMessage,
  enableInlineComments,
  messageIndex,
  sectionKey,
  commentedRanges,
}: ChatMessageProps) {
  const [showTableView, setShowTableView] = useState(false);

  const title = getMessageTitle(message);
  const toolCalls = parseToolCallsFromMessage(message);
  const hasContent = hasRenderableContent(message);

  // Toggle button for passthrough JSON
  const passthroughToggleButton = hasPassthroughJson(message) ? (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => setShowTableView((v) => !v)}
      title={
        showTableView ? "Show formatted view" : "Show passthrough JSON data"
      }
      className="-mr-2 hover:bg-border"
    >
      {showTableView ? (
        <ListChevronsDownUp className="h-3 w-3 text-primary" />
      ) : (
        <ListChevronsUpDown className="h-3 w-3" />
      )}
    </Button>
  ) : undefined;

  // Placeholder message
  if (isPlaceholderMessage(message)) {
    return (
      <div className={cn("transition-colors hover:bg-muted")}>
        <div style={{ display: shouldRenderMarkdown ? "block" : "none" }}>
          <MarkdownJsonView
            title="Placeholder"
            content={message.name || "Unnamed placeholder"}
            customCodeHeaderClassName={cn("bg-primary-foreground")}
          />
        </div>
        <div style={{ display: shouldRenderMarkdown ? "none" : "block" }}>
          <PrettyJsonView
            title="Placeholder"
            json={message.name || "Unnamed placeholder"}
            projectIdForPromptButtons={projectIdForPromptButtons}
            currentView={currentView}
          />
        </div>
      </div>
    );
  }

  // JSON-only message (non-ChatML object)
  if (isOnlyJsonMessage(message)) {
    return (
      <div className={cn("transition-colors hover:bg-muted")}>
        <PrettyJsonView
          title={title || (isOutputMessage ? "Output" : "Input")}
          json={message.json}
          projectIdForPromptButtons={projectIdForPromptButtons}
          currentView={currentView}
        />
      </div>
    );
  }

  // User toggled to show passthrough JSON
  if (showTableView) {
    return (
      <div className={cn("transition-colors hover:bg-muted")}>
        <PrettyJsonView
          title={title}
          json={message.json}
          projectIdForPromptButtons={projectIdForPromptButtons}
          currentView="pretty"
          controlButtons={passthroughToggleButton}
        />
      </div>
    );
  }

  // Tool-call-only message (no content)
  if (!hasContent && toolCalls.length > 0) {
    return (
      <div className={cn("transition-colors hover:bg-muted")}>
        <MarkdownJsonViewHeader
          title={title}
          handleOnValueChange={() => {}}
          handleOnCopy={() => {
            const rawText = JSON.stringify(message, null, 2);
            void copyTextToClipboard(rawText);
          }}
          controlButtons={passthroughToggleButton}
        />
        <ToolCallInvocationsView
          message={message}
          toolCallNumbers={toolCallNumbers}
        />
      </div>
    );
  }

  // Content message (with optional tool calls)
  if (hasContent) {
    const contentString =
      typeof message.content === "string" ? message.content : "";
    const hasCommentHighlights =
      enableInlineComments && commentedRanges && commentedRanges.length > 0;

    return (
      <div className={cn("transition-colors hover:bg-muted")}>
        {/* Markdown view */}
        <div style={{ display: shouldRenderMarkdown ? "block" : "none" }}>
          <div
            data-json-path={
              enableInlineComments
                ? `$.messages[${messageIndex}].content`
                : undefined
            }
            data-section-key={enableInlineComments ? sectionKey : undefined}
            data-json-key-value={enableInlineComments ? "true" : undefined}
          >
            {hasCommentHighlights && contentString ? (
              // Render with comment highlighting
              <div
                className={cn(
                  "io-message-content flex gap-2 whitespace-pre-wrap break-words rounded-sm border p-2 text-xs",
                  message.role === "assistant" && "bg-secondary",
                  message.role === "system" && "bg-primary-foreground",
                )}
              >
                <MarkdownJsonViewHeader
                  title={title}
                  handleOnValueChange={() => {}}
                  handleOnCopy={() => {
                    void copyTextToClipboard(contentString);
                  }}
                  controlButtons={passthroughToggleButton}
                />
                <code className="whitespace-pre-wrap break-words font-mono">
                  {highlightTextWithComments(
                    contentString,
                    undefined,
                    undefined,
                    commentedRanges,
                  ).map((segment, index) => {
                    const backgroundColor =
                      segment.type === "comment"
                        ? COMMENT_HIGHLIGHT_COLOR
                        : "transparent";

                    const highlightedSpan = (
                      <span key={index} style={{ backgroundColor }}>
                        {segment.text}
                      </span>
                    );

                    if (segment.type === "comment" && segment.preview) {
                      return (
                        <Tooltip key={index}>
                          <TooltipTrigger asChild>
                            {highlightedSpan}
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="start"
                            className="max-w-xs px-2 py-1 text-xs"
                          >
                            {segment.preview}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return highlightedSpan;
                  })}
                </code>
              </div>
            ) : (
              <MarkdownJsonView
                title={title}
                content={message.content || '""'}
                customCodeHeaderClassName={cn(
                  message.role === "assistant" && "bg-secondary",
                  message.role === "system" && "bg-primary-foreground",
                )}
                audio={message.audio}
                controlButtons={passthroughToggleButton}
              />
            )}
          </div>
          {toolCalls.length > 0 && (
            <div className="mt-2">
              <ToolCallInvocationsView
                message={message}
                toolCallNumbers={toolCallNumbers}
              />
            </div>
          )}
        </div>

        {/* JSON view */}
        <div style={{ display: shouldRenderMarkdown ? "none" : "block" }}>
          <div
            data-json-path={
              enableInlineComments
                ? `$.messages[${messageIndex}].content`
                : undefined
            }
            data-section-key={enableInlineComments ? sectionKey : undefined}
            data-json-key-value={enableInlineComments ? "true" : undefined}
          >
            <PrettyJsonView
              title={title}
              json={message.content}
              projectIdForPromptButtons={projectIdForPromptButtons}
              currentView={currentView}
              controlButtons={passthroughToggleButton}
            />
          </div>
          {toolCalls.length > 0 && (
            <div className="mt-2">
              <ToolCallInvocationsView
                message={message}
                toolCallNumbers={toolCallNumbers}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback: message with additional data but no content
  if (hasAdditionalData(message)) {
    return (
      <div className={cn("transition-colors hover:bg-muted")}>
        <PrettyJsonView
          title={title || (isOutputMessage ? "Output" : "Input")}
          json={message}
          projectIdForPromptButtons={projectIdForPromptButtons}
          currentView={currentView}
        />
      </div>
    );
  }

  return null;
}
