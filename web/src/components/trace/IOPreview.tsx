import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ActionButton } from "@/src/components/ActionButton";
import { Fragment } from "react";
import type { z } from "zod/v4";
import type {
  ChatMlArraySchema,
  ChatMlMessageSchema,
} from "@/src/components/schemas/ChatMlSchema";
import { type MediaReturnType } from "@/src/features/media/validation";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import {
  MarkdownJsonView,
  MarkdownJsonViewHeader,
} from "@/src/components/ui/MarkdownJsonView";
import { SubHeaderLabel } from "@/src/components/layouts/header";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";
import usePreserveRelativeScroll from "@/src/hooks/usePreserveRelativeScroll";
import { MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/utils/constants";
import {
  normalizeInput,
  normalizeOutput,
  combineInputOutputMessages,
  cleanLegacyOutput,
  extractAdditionalInput,
} from "@/src/utils/chatml";
import { ToolCallDefinitionCard } from "@/src/components/trace/ToolCallDefinitionCard";
import { ToolCallInvocationsView } from "@/src/components/trace/ToolCallInvocationsView";
import {
  ListChevronsDownUp,
  ListChevronsUpDown,
  BookOpen,
  X,
} from "lucide-react";
import { copyTextToClipboard } from "@/src/utils/clipboard";

const EMPTY_IO_ALERT_ID = "empty-io";
const STORAGE_KEY = "dismissed-trace-view-notifications";

export const IOPreview: React.FC<{
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  observationName?: string;
  isLoading?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  currentView?: "pretty" | "json";
  setIsPrettyViewAvailable?: (value: boolean) => void;
  inputExpansionState?: Record<string, boolean> | boolean;
  outputExpansionState?: Record<string, boolean> | boolean;
  onInputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onOutputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
}> = ({
  isLoading = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  currentView,
  inputExpansionState,
  outputExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
  setIsPrettyViewAvailable,
  ...props
}) => {
  const [localCurrentView, setLocalCurrentView] = useLocalStorage<
    "pretty" | "json"
  >("jsonViewPreference", "pretty");
  const selectedView = currentView ?? localCurrentView;
  const capture = usePostHogClientCapture();
  const [dismissedTraceViewNotifications, setDismissedTraceViewNotifications] =
    useLocalStorage<string[]>(STORAGE_KEY, []);
  const input = deepParseJson(props.input);
  const output = deepParseJson(props.output);
  const metadata = deepParseJson(props.metadata);
  const [compensateScrollRef, startPreserveScroll] =
    usePreserveRelativeScroll<HTMLDivElement>([selectedView]);

  const {
    canDisplayAsChat,
    allMessages,
    additionalInput,
    allTools,
    toolCallCounts,
    messageToToolCallNumbers,
    toolNameToDefinitionNumber,
  } = useMemo(() => {
    const ctx = { metadata, observationName: props.observationName };
    const inResult = normalizeInput(input, ctx);
    const outResult = normalizeOutput(output, ctx);
    const outputClean = cleanLegacyOutput(output, output);
    const messages = combineInputOutputMessages(
      inResult,
      outResult,
      outputClean,
    );

    // extract all unique tools from messages (no numbering yet)
    const toolsMap = new Map<
      string,
      { name: string; description?: string; parameters?: Record<string, any> }
    >();

    for (const message of messages) {
      if (message.tools && Array.isArray(message.tools)) {
        for (const tool of message.tools) {
          if (!toolsMap.has(tool.name)) {
            toolsMap.set(tool.name, tool);
          }
        }
      }
    }

    // count tool call invocations and tool calls
    // Only number tool calls from OUTPUT messages (current invocation), not input (history)
    const inputMessageCount = inResult.success ? inResult.data.length : 0;
    let toolCallCounter = 0;
    const messageToToolCallNumbers = new Map<number, number[]>();
    const toolCallCounts = new Map<string, number>();

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const isOutputMessage = i >= inputMessageCount; // Only output messages get numbered

      const toolCallList = parseToolCallsFromMessage(message);

      if (toolCallList.length > 0) {
        const messageToolNumbers: number[] = [];

        for (const toolCall of toolCallList) {
          const calledToolName =
            toolCall.name && typeof toolCall.name === "string"
              ? toolCall.name
              : // AI SDK has 'toolName'
                toolCall.toolName && typeof toolCall.toolName === "string"
                ? toolCall.toolName
                : undefined;

          if (calledToolName) {
            // count tool calls from OUTPUT messages only, only those were called
            // in this generation
            if (isOutputMessage) {
              toolCallCounts.set(
                calledToolName,
                (toolCallCounts.get(calledToolName) || 0) + 1,
              );
              toolCallCounter++;
              messageToolNumbers.push(toolCallCounter);
            }
          }
        }

        if (messageToolNumbers.length > 0) {
          messageToToolCallNumbers.set(i, messageToolNumbers);
        }
      }
    }

    // sort tools by display order (called first, then by call count)
    const sortedTools = Array.from(toolsMap.values()).sort((a, b) => {
      const callCountA = toolCallCounts.get(a.name) || 0;
      const callCountB = toolCallCounts.get(b.name) || 0;
      // Sort by called status (called first), then by call count descending
      if (callCountA > 0 && callCountB === 0) return -1;
      if (callCountA === 0 && callCountB > 0) return 1;
      return callCountB - callCountA;
    });

    // assign definition numbers based on sorted display order
    const toolNameToDefinitionNumber = new Map<string, number>();
    sortedTools.forEach((tool, index) => {
      toolNameToDefinitionNumber.set(tool.name, index + 1);
    });

    return {
      canDisplayAsChat:
        (inResult.success || outResult.success) && messages.length > 0,
      allMessages: messages,
      additionalInput: extractAdditionalInput(input),
      allTools: sortedTools,
      toolCallCounts,
      messageToToolCallNumbers,
      toolNameToDefinitionNumber,
    };
  }, [input, output, metadata, props.observationName]);

  // Pretty view is available for ChatML content OR any JSON content
  const isPrettyViewAvailable = true; // Always show the toggle, let individual components decide how to render

  useEffect(() => {
    setIsPrettyViewAvailable?.(isPrettyViewAvailable);
  }, [isPrettyViewAvailable, setIsPrettyViewAvailable]);

  // Don't render markdown if total content size exceeds limit
  const inputSize = JSON.stringify(input || {}).length;
  const outputSize = JSON.stringify(output || {}).length;
  const messagesSize = JSON.stringify(allMessages).length;
  const totalContentSize = inputSize + outputSize + messagesSize;

  const shouldRenderMarkdownSafely =
    totalContentSize <= MARKDOWN_RENDER_CHARACTER_LIMIT;

  const showEmptyState =
    (input === null || input === undefined) &&
    (output === null || output === undefined) &&
    !isLoading &&
    !hideIfNull &&
    !dismissedTraceViewNotifications.includes(EMPTY_IO_ALERT_ID);

  // default I/O
  return (
    <>
      {/* Show tools at the top if available */}
      {allTools.length > 0 && (
        <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
          <div className="mb-4 border-b border-border pb-4">
            <div className="io-message-header px-1 py-1 text-sm font-medium capitalize">
              Tools
            </div>
            <ToolCallDefinitionCard
              tools={allTools}
              toolCallCounts={toolCallCounts}
              toolNameToDefinitionNumber={toolNameToDefinitionNumber}
              className="px-2"
            />
          </div>
        </div>
      )}

      {isPrettyViewAvailable && !currentView ? (
        <div className="flex w-full flex-row justify-start">
          <Tabs
            ref={compensateScrollRef}
            className="h-fit py-0.5"
            value={selectedView}
            onValueChange={(value) => {
              startPreserveScroll();
              capture("trace_detail:io_mode_switch", { view: value });
              setLocalCurrentView(value as "pretty" | "json");
            }}
          >
            <TabsList className="h-fit p-0.5">
              <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
                Formatted
              </TabsTrigger>
              <TabsTrigger value="json" className="h-fit px-1 text-xs">
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}
      {/* Always render components to preserve state, just hide via CSS*/}
      {isPrettyViewAvailable ? (
        <>
          {/* Pretty view content */}
          <div
            style={{ display: selectedView === "pretty" ? "block" : "none" }}
          >
            {canDisplayAsChat ? (
              <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
                <OpenAiMessageView
                  messages={allMessages}
                  shouldRenderMarkdown={shouldRenderMarkdownSafely}
                  additionalInput={
                    Object.keys(additionalInput ?? {}).length > 0
                      ? additionalInput
                      : undefined
                  }
                  media={media ?? []}
                  currentView={selectedView}
                  messageToToolCallNumbers={messageToToolCallNumbers}
                />
              </div>
            ) : (
              <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
                {!(hideIfNull && !input) && !hideInput ? (
                  <PrettyJsonView
                    title="Input"
                    json={input ?? null}
                    isLoading={isLoading}
                    media={media?.filter((m) => m.field === "input") ?? []}
                    currentView={selectedView}
                    externalExpansionState={inputExpansionState}
                    onExternalExpansionChange={onInputExpansionChange}
                  />
                ) : null}
                {!(hideIfNull && !output) && !hideOutput ? (
                  <PrettyJsonView
                    title="Output"
                    json={output}
                    isLoading={isLoading}
                    media={media?.filter((m) => m.field === "output") ?? []}
                    currentView={selectedView}
                    externalExpansionState={outputExpansionState}
                    onExternalExpansionChange={onOutputExpansionChange}
                  />
                ) : null}
              </div>
            )}
          </div>

          {/* JSON view content */}
          <div style={{ display: selectedView === "json" ? "block" : "none" }}>
            <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
              {!(hideIfNull && !input) && !hideInput ? (
                <PrettyJsonView
                  title="Input"
                  json={input ?? null}
                  isLoading={isLoading}
                  media={media?.filter((m) => m.field === "input") ?? []}
                  currentView={selectedView}
                  externalExpansionState={inputExpansionState}
                  onExternalExpansionChange={onInputExpansionChange}
                />
              ) : null}
              {!(hideIfNull && !output) && !hideOutput ? (
                <PrettyJsonView
                  title="Output"
                  json={output}
                  isLoading={isLoading}
                  media={media?.filter((m) => m.field === "output") ?? []}
                  currentView={selectedView}
                  externalExpansionState={outputExpansionState}
                  onExternalExpansionChange={onOutputExpansionChange}
                />
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
          {!(hideIfNull && !input) && !hideInput ? (
            <PrettyJsonView
              title="Input"
              json={input ?? null}
              isLoading={isLoading}
              media={media?.filter((m) => m.field === "input") ?? []}
              currentView={selectedView}
              externalExpansionState={inputExpansionState}
              onExternalExpansionChange={onInputExpansionChange}
            />
          ) : null}
          {!(hideIfNull && !output) && !hideOutput ? (
            <PrettyJsonView
              title="Output"
              json={output}
              isLoading={isLoading}
              media={media?.filter((m) => m.field === "output") ?? []}
              currentView={selectedView}
              externalExpansionState={outputExpansionState}
              onExternalExpansionChange={onOutputExpansionChange}
            />
          ) : null}
        </div>
      )}
      {showEmptyState && (
        <div className="relative mx-2 flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1.5 top-1.5 h-5 w-5 p-0"
            onClick={() => {
              capture("notification:dismiss_notification", {
                notification_id: EMPTY_IO_ALERT_ID,
              });
              setDismissedTraceViewNotifications((prev) =>
                prev.includes(EMPTY_IO_ALERT_ID)
                  ? prev
                  : [...prev, EMPTY_IO_ALERT_ID],
              );
            }}
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <div className="flex w-full flex-row items-center gap-2 pr-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">
              Looks like this trace didn&apos;t receive an input or output.
            </h3>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add it in your code to make debugging a lot easier.
          </p>
          <ActionButton
            variant="outline"
            size="sm"
            href="https://langfuse.com/faq/all/empty-trace-input-and-output"
            trackingEventName="notification:click_link"
            trackingProps={{ notification_id: EMPTY_IO_ALERT_ID }}
          >
            View Documentation
          </ActionButton>
        </div>
      )}
    </>
  );
};

// create message title
const getMessageTitle = (
  message: z.infer<typeof ChatMlMessageSchema>,
): string => {
  return message.name ?? message.role ?? "";
};

export const OpenAiMessageView: React.FC<{
  messages: z.infer<typeof ChatMlArraySchema>;
  title?: string;
  shouldRenderMarkdown?: boolean;
  collapseLongHistory?: boolean;
  media?: MediaReturnType[];
  additionalInput?: Record<string, unknown>;
  projectIdForPromptButtons?: string;
  currentView?: "pretty" | "json";
  messageToToolCallNumbers?: Map<number, number[]>;
}> = ({
  title,
  messages,
  shouldRenderMarkdown = false,
  media,
  collapseLongHistory = true,
  additionalInput,
  projectIdForPromptButtons,
  currentView = "json",
  messageToToolCallNumbers,
}) => {
  const COLLAPSE_THRESHOLD = 3;

  // stores which messages should show table view (json) instead of pretty view
  const [showTableView, setShowTableView] = useState<Set<number>>(new Set());

  const toggleTableView = (index: number) => {
    setShowTableView((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const shouldRenderContent = (message: ChatMlMessageSchema) => {
    // Don't render if content is empty string or null/undefined in ChatML view
    // happens e.g. if an LLM only uses a tool
    const hasContent = message.content != null && message.content !== "";
    return hasContent || !!message.audio;
  };

  // TODO: removed for now, we never show additional JSON alongside the ChatML content
  // because we now have a switch to display it. We re-add this depending on user feedback.
  // const shouldRenderJson = (message: ChatMlMessageSchema) => {
  //   return !!message.json;
  // };
  const hasAdditionalData = (message: ChatMlMessageSchema) => {
    // if anything more than role & content exists, we show the button
    const messageKeys = Object.keys(message).filter(
      (key) => key !== "role" && key !== "content",
    );
    return messageKeys.length > 0;
  };

  const hasPassthroughJson = (message: ChatMlMessageSchema) => {
    return message.json != null;
  };

  const isPlaceholderMessage = (message: ChatMlMessageSchema) => {
    return message.type === "placeholder";
  };

  const isOnlyJsonMessage = (message: ChatMlMessageSchema) => {
    // Message parsed as ChatML but only has json field (non-ChatML object)
    // Valid ChatML needs content OR tool_calls OR audio (role alone is insufficient)
    const hasValidChatMlContent =
      message.content != null ||
      message.tool_calls != null ||
      message.audio != null;

    return !hasValidChatMlContent && message.json != null;
  };

  const messagesToRender = useMemo(
    () =>
      messages.filter(
        (message) =>
          shouldRenderContent(message) ||
          // shouldRenderJson(message) ||
          hasAdditionalData(message) ||
          isPlaceholderMessage(message),
      ),
    [messages],
  );

  // Initialize collapsed state based on filtered messages, we only want to show
  // "Show X more..." if there actually are more messages to show
  const [isCollapsed, setCollapsed] = useState(
    collapseLongHistory && messagesToRender.length > COLLAPSE_THRESHOLD
      ? true
      : null,
  );

  return (
    <div className="flex max-h-full min-h-0 flex-col gap-2">
      {title && <SubHeaderLabel title={title} className="mt-1" />}
      <div className="flex max-h-full min-h-0 flex-col gap-2">
        <div className="flex flex-col gap-2">
          {messagesToRender
            .map((message, originalIndex) => ({ message, originalIndex }))
            .filter(
              ({ originalIndex }) =>
                // show all if not collapsed or null; show first and last n if collapsed
                !isCollapsed ||
                originalIndex == 0 ||
                originalIndex > messagesToRender.length - COLLAPSE_THRESHOLD,
            )
            .map(({ message, originalIndex }) => {
              // Check if user toggled to table view
              const isShowingTable = showTableView.has(originalIndex);
              return (
                <>
                  <div
                    key={originalIndex}
                    className={cn("transition-colors hover:bg-muted")}
                  >
                    {isPlaceholderMessage(message) ? (
                      <>
                        <div
                          style={{
                            display: shouldRenderMarkdown ? "block" : "none",
                          }}
                        >
                          <MarkdownJsonView
                            title="Placeholder"
                            content={message.name || "Unnamed placeholder"}
                            customCodeHeaderClassName={cn(
                              "bg-primary-foreground",
                            )}
                          />
                        </div>
                        <div
                          style={{
                            display: shouldRenderMarkdown ? "none" : "block",
                          }}
                        >
                          <PrettyJsonView
                            title="Placeholder"
                            json={message.name || "Unnamed placeholder"}
                            projectIdForPromptButtons={
                              projectIdForPromptButtons
                            }
                            currentView={currentView}
                          />
                        </div>
                      </>
                    ) : isOnlyJsonMessage(message) ? (
                      // Non-ChatML object that parsed via passthrough - render as JSON
                      <PrettyJsonView
                        title={getMessageTitle(message) || "Output"}
                        json={message.json}
                        projectIdForPromptButtons={projectIdForPromptButtons}
                        currentView={currentView}
                      />
                    ) : (
                      <>
                        {shouldRenderContent(message) &&
                          !showTableView.has(originalIndex) && (
                            <>
                              <div
                                style={{
                                  display: shouldRenderMarkdown
                                    ? "block"
                                    : "none",
                                }}
                              >
                                <MarkdownJsonView
                                  title={getMessageTitle(message)}
                                  content={message.content || '""'}
                                  customCodeHeaderClassName={cn(
                                    message.role === "assistant" &&
                                      "bg-secondary",
                                    message.role === "system" &&
                                      "bg-primary-foreground",
                                  )}
                                  audio={message.audio}
                                  controlButtons={
                                    hasPassthroughJson(message) ? (
                                      <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() =>
                                          toggleTableView(originalIndex)
                                        }
                                        title="Show passthrough JSON data"
                                        className="-mr-2 hover:bg-border"
                                      >
                                        <ListChevronsUpDown className="h-3 w-3" />
                                      </Button>
                                    ) : undefined
                                  }
                                />
                                {parseToolCallsFromMessage(message).length >
                                  0 && (
                                  <div className="mt-2">
                                    <ToolCallInvocationsView
                                      message={message}
                                      toolCallNumbers={messageToToolCallNumbers?.get(
                                        originalIndex,
                                      )}
                                    />
                                  </div>
                                )}
                              </div>
                              <div
                                style={{
                                  display: shouldRenderMarkdown
                                    ? "none"
                                    : "block",
                                }}
                              >
                                <PrettyJsonView
                                  title={getMessageTitle(message)}
                                  json={message.content}
                                  projectIdForPromptButtons={
                                    projectIdForPromptButtons
                                  }
                                  currentView={currentView}
                                  controlButtons={
                                    hasPassthroughJson(message) ? (
                                      <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() =>
                                          toggleTableView(originalIndex)
                                        }
                                        title="Show passthrough JSON data"
                                        className="-mr-2 hover:bg-border"
                                      >
                                        <ListChevronsUpDown className="h-3 w-3" />
                                      </Button>
                                    ) : undefined
                                  }
                                />
                                {parseToolCallsFromMessage(message).length >
                                  0 && (
                                  <div className="mt-2">
                                    <ToolCallInvocationsView
                                      message={message}
                                      toolCallNumbers={messageToToolCallNumbers?.get(
                                        originalIndex,
                                      )}
                                    />
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        {isShowingTable ? (
                          // User clicked toggle - show passthrough JSON
                          <PrettyJsonView
                            title={getMessageTitle(message)}
                            json={message.json}
                            projectIdForPromptButtons={
                              projectIdForPromptButtons
                            }
                            currentView="pretty"
                            controlButtons={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => toggleTableView(originalIndex)}
                                title="Show formatted view"
                                className="-mr-2 hover:bg-border"
                              >
                                <ListChevronsDownUp className="h-3 w-3 text-primary" />
                              </Button>
                            }
                          />
                        ) : !shouldRenderContent(message) &&
                          parseToolCallsFromMessage(message).length > 0 ? (
                          // No content but has tool_calls - show tool invocations
                          <div>
                            <MarkdownJsonViewHeader
                              title={getMessageTitle(message)}
                              handleOnValueChange={() => {}}
                              handleOnCopy={() => {
                                const rawText = JSON.stringify(
                                  message,
                                  null,
                                  2,
                                );
                                void copyTextToClipboard(rawText);
                              }}
                              controlButtons={
                                hasPassthroughJson(message) ? (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() =>
                                      toggleTableView(originalIndex)
                                    }
                                    title="Show passthrough JSON data"
                                    className="-mr-2 hover:bg-border"
                                  >
                                    <ListChevronsUpDown className="h-3 w-3" />
                                  </Button>
                                ) : undefined
                              }
                            />
                            <ToolCallInvocationsView
                              message={message}
                              toolCallNumbers={messageToToolCallNumbers?.get(
                                originalIndex,
                              )}
                            />
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  {isCollapsed !== null && originalIndex === 0 ? (
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
                  ) : null}
                </>
              );
            })}
        </div>
        {additionalInput && (
          <PrettyJsonView
            title="Additional Input"
            json={additionalInput}
            projectIdForPromptButtons={projectIdForPromptButtons}
            currentView={shouldRenderMarkdown ? "pretty" : "json"}
          />
        )}
        {media && media.length > 0 && (
          <>
            <div className="mx-3 border-t px-2 py-1 text-xs text-muted-foreground">
              Media
            </div>
            <div className="flex flex-wrap gap-2 p-4 pt-1">
              {media.map((m) => (
                <LangfuseMediaView
                  mediaAPIReturnValue={m}
                  asFileIcon={true}
                  key={m.mediaId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function parseToolCallsFromMessage(
  message: ReturnType<typeof combineInputOutputMessages>[0],
) {
  return message.tool_calls && Array.isArray(message.tool_calls)
    ? message.tool_calls
    : message.json?.tool_calls && Array.isArray(message.json?.tool_calls)
      ? message.json.tool_calls
      : [];
}
