import { useEffect, useMemo } from "react";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";
import usePreserveRelativeScroll from "@/src/hooks/usePreserveRelativeScroll";
import { MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/utils/constants";
import { type MediaReturnType } from "@/src/features/media/validation";

import { useChatMLParser } from "./hooks/useChatMLParser";
import { ChatMessageList } from "./components/ChatMessageList";
import { SectionToolDefinitions } from "./components/SectionToolDefinitions";
import { ViewModeToggle, type ViewMode } from "./components/ViewModeToggle";
import { Button } from "@/src/components/ui/button";
import { ActionButton } from "@/src/components/ActionButton";
import { BookOpen, X } from "lucide-react";

export type { ViewMode };

const EMPTY_IO_ALERT_ID = "empty-io";
const STORAGE_KEY = "dismissed-trace-view-notifications";

export interface ExpansionStateProps {
  inputExpansionState?: Record<string, boolean> | boolean;
  outputExpansionState?: Record<string, boolean> | boolean;
  onInputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onOutputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
}

export interface IOPreviewProps extends ExpansionStateProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  observationName?: string;
  isLoading?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  currentView?: ViewMode;
  setIsPrettyViewAvailable?: (value: boolean) => void;
}

interface JsonInputOutputViewProps {
  parsedInput: unknown;
  parsedOutput: unknown;
  isLoading: boolean;
  media?: MediaReturnType[];
  selectedView: ViewMode;
  hideIfNull: boolean;
  hideInput: boolean;
  hideOutput: boolean;
  inputExpansionState?: Record<string, boolean> | boolean;
  outputExpansionState?: Record<string, boolean> | boolean;
  onInputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onOutputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
}

function JsonInputOutputView({
  parsedInput,
  parsedOutput,
  isLoading,
  media,
  selectedView,
  hideIfNull,
  hideInput,
  hideOutput,
  inputExpansionState,
  outputExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
}: JsonInputOutputViewProps) {
  const showInput = !hideInput && !(hideIfNull && !parsedInput);
  const showOutput = !hideOutput && !(hideIfNull && !parsedOutput);

  return (
    <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
      {showInput && (
        <PrettyJsonView
          title="Input"
          json={parsedInput ?? null}
          isLoading={isLoading}
          media={media?.filter((m) => m.field === "input") ?? []}
          currentView={selectedView}
          externalExpansionState={inputExpansionState}
          onExternalExpansionChange={onInputExpansionChange}
        />
      )}
      {showOutput && (
        <PrettyJsonView
          title="Output"
          json={parsedOutput}
          isLoading={isLoading}
          media={media?.filter((m) => m.field === "output") ?? []}
          currentView={selectedView}
          externalExpansionState={outputExpansionState}
          onExternalExpansionChange={onOutputExpansionChange}
        />
      )}
    </div>
  );
}

/**
 * IOPreview renders input/output data from LLM observations.
 *
 * Features:
 * - ChatML message format detection and rendering
 * - Tool definitions and invocations display
 * - Pretty/JSON view toggle
 * - Media attachments support
 * - Large content safety (markdown rendering limit)
 */
export function IOPreview({
  input,
  output,
  metadata,
  observationName,
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
}: IOPreviewProps) {
  const capture = usePostHogClientCapture();
  const [dismissedTraceViewNotifications, setDismissedTraceViewNotifications] =
    useLocalStorage<string[]>(STORAGE_KEY, []);

  // View state management
  const [localCurrentView, setLocalCurrentView] = useLocalStorage<ViewMode>(
    "jsonViewPreference",
    "pretty",
  );
  const selectedView = currentView ?? localCurrentView;
  const showViewToggle = currentView === undefined;

  const [compensateScrollRef, startPreserveScroll] =
    usePreserveRelativeScroll<HTMLDivElement>([selectedView]);

  // Parse input/output
  const parsedInput = deepParseJson(input);
  const parsedOutput = deepParseJson(output);

  // Parse ChatML format
  const {
    canDisplayAsChat,
    allMessages,
    additionalInput,
    allTools,
    toolCallCounts,
    messageToToolCallNumbers,
    toolNameToDefinitionNumber,
  } = useChatMLParser(input, output, metadata, observationName);

  // Notify parent about pretty view availability
  // Always true - we always show the toggle and let components decide rendering
  useEffect(() => {
    setIsPrettyViewAvailable?.(true);
  }, [setIsPrettyViewAvailable]);

  // Determine if markdown is safe to render (content size check)
  const shouldRenderMarkdown = useMemo(() => {
    const inputSize = JSON.stringify(parsedInput || {}).length;
    const outputSize = JSON.stringify(parsedOutput || {}).length;
    const messagesSize = JSON.stringify(allMessages).length;
    return (
      inputSize + outputSize + messagesSize <= MARKDOWN_RENDER_CHARACTER_LIMIT
    );
  }, [parsedInput, parsedOutput, allMessages]);

  // Handle view change with analytics
  const handleViewChange = (view: ViewMode) => {
    startPreserveScroll();
    capture("trace_detail:io_mode_switch", { view });
    setLocalCurrentView(view);
  };

  // Prepare additional input (only if non-empty)
  const additionalInputToShow = useMemo(() => {
    if (!additionalInput || Object.keys(additionalInput).length === 0) {
      return undefined;
    }
    return additionalInput;
  }, [additionalInput]);

  // Shared props for JsonInputOutputView
  const jsonViewProps = {
    parsedInput,
    parsedOutput,
    isLoading,
    media,
    selectedView,
    hideIfNull,
    hideInput,
    hideOutput,
    inputExpansionState,
    outputExpansionState,
    onInputExpansionChange,
    onOutputExpansionChange,
  };

  const showEmptyState =
    (parsedInput === null || parsedInput === undefined) &&
    (parsedOutput === null || parsedOutput === undefined) &&
    !isLoading &&
    !hideIfNull &&
    !dismissedTraceViewNotifications.includes(EMPTY_IO_ALERT_ID);

  return (
    <>
      <SectionToolDefinitions
        tools={allTools}
        toolCallCounts={toolCallCounts}
        toolNameToDefinitionNumber={toolNameToDefinitionNumber}
      />

      {showViewToggle && (
        <ViewModeToggle
          selectedView={selectedView}
          onViewChange={handleViewChange}
          compensateScrollRef={compensateScrollRef}
        />
      )}

      {/*
       * Content views - BOTH are rendered but one is hidden via CSS.
       * This preserves component state (scroll position, expansion state, etc.)
       * when toggling between views, avoiding re-mount and data loss.
       */}
      <div style={{ display: selectedView === "pretty" ? "block" : "none" }}>
        {canDisplayAsChat ? (
          <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
            <ChatMessageList
              messages={allMessages}
              shouldRenderMarkdown={shouldRenderMarkdown}
              additionalInput={additionalInputToShow}
              media={media ?? []}
              currentView={selectedView}
              messageToToolCallNumbers={messageToToolCallNumbers}
            />
          </div>
        ) : (
          <JsonInputOutputView {...jsonViewProps} />
        )}
      </div>

      <div style={{ display: selectedView === "json" ? "block" : "none" }}>
        <JsonInputOutputView {...jsonViewProps} />
      </div>
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
}
