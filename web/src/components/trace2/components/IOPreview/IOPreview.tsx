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

export type { ViewMode };

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
  const t0 = performance.now();
  const parsedInput = deepParseJson(input);
  const t1 = performance.now();
  const parsedOutput = deepParseJson(output);
  const t2 = performance.now();

  const inputSize = JSON.stringify(input || {}).length;
  const outputSize = JSON.stringify(output || {}).length;

  console.log(
    `[IOPreview] deepParseJson calls:`,
    `\n  - Input: ${(inputSize / 1024).toFixed(2)}KB, parse time: ${(t1 - t0).toFixed(2)}ms`,
    `\n  - Output: ${(outputSize / 1024).toFixed(2)}KB, parse time: ${(t2 - t1).toFixed(2)}ms`,
  );

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
    const startTime = performance.now();

    // Fast byte estimation without expensive JSON.stringify
    // Estimate: count string lengths + rough object overhead
    const estimateSize = (obj: unknown): number => {
      if (obj === null || obj === undefined) return 4; // "null" or "undefined"
      if (typeof obj === "string") return obj.length;
      if (typeof obj === "number") return obj.toString().length;
      if (typeof obj === "boolean") return obj ? 4 : 5; // "true" or "false"

      if (Array.isArray(obj)) {
        // Rough estimate: sum of elements + commas + brackets
        return obj.reduce((sum, item) => sum + estimateSize(item) + 1, 2);
      }

      if (typeof obj === "object") {
        // Rough estimate: keys + values + colons + commas + braces
        return Object.entries(obj).reduce(
          (sum, [key, value]) => sum + key.length + estimateSize(value) + 3, // 3 for ":", "," and quotes
          2, // 2 for opening and closing braces
        );
      }

      return 0;
    };

    const inputSize = estimateSize(parsedInput);
    const outputSize = estimateSize(parsedOutput);
    const messagesSize = estimateSize(allMessages);
    const totalSize = inputSize + outputSize + messagesSize;

    const shouldRender = totalSize <= MARKDOWN_RENDER_CHARACTER_LIMIT;

    const elapsed = performance.now() - startTime;

    // Performance logging
    console.log(
      `[IOPreview] shouldRenderMarkdown check:`,
      `\n  - Input size: ${(inputSize / 1024).toFixed(2)}KB`,
      `\n  - Output size: ${(outputSize / 1024).toFixed(2)}KB`,
      `\n  - Messages size: ${(messagesSize / 1024).toFixed(2)}KB`,
      `\n  - Total size: ${(totalSize / 1024).toFixed(2)}KB`,
      `\n  - Limit: ${(MARKDOWN_RENDER_CHARACTER_LIMIT / 1024).toFixed(2)}KB`,
      `\n  - Decision: ${shouldRender ? "RENDER MARKDOWN" : "SKIP MARKDOWN"}`,
      `\n  - Time taken: ${elapsed.toFixed(2)}ms`,
    );

    return shouldRender;
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
    </>
  );
}
