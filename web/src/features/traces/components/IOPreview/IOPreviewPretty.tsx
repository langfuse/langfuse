import { useEffect, useMemo, useRef } from "react";
import { type Prisma, type ScoreDomain, deepParseJson } from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MetadataFilterActions } from "@/src/components/table/ValueCell";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type ChatMLParserResult } from "../../hooks/useChatMLParser";
import {
  type IOPreviewParserComparisonOutcome,
  type IOPreviewParserMode,
  hasRenderableChatMessages,
  useIOPreviewParser,
} from "../../hooks/useIOPreviewParser";
import { ChatMessageList } from "../ChatMessageList";
import { SectionToolDefinitions } from "./components/SectionToolDefinitions";
import {
  type ExpansionStateProps,
  type IOPreviewContentMode,
} from "./IOPreview";
import { CorrectedOutputField } from "./components/CorrectedOutputField";
import { StatusMessageSection } from "./components/StatusMessageSection";
import type { ObservationStatusMessage } from "./components/statusMessagePresentation";

interface JsonInputOutputViewProps {
  parsedInput: unknown;
  parsedOutput: unknown;
  isLoading: boolean;
  isParsing?: boolean;
  media?: MediaReturnType[];
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
  isParsing,
  media,
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
    <div className="space-y-4 [&_.io-message-content]:px-3 [&_.io-message-header]:px-3">
      {showInput && (
        <PrettyJsonView
          hideHeader
          title="Input"
          json={parsedInput ?? null}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "input") ?? []}
          currentView="pretty"
          externalExpansionState={inputExpansionState}
          onExternalExpansionChange={onInputExpansionChange}
          hoverControls
        />
      )}
      {showOutput && (
        <PrettyJsonView
          hideHeader
          title="Output"
          json={parsedOutput}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "output") ?? []}
          currentView="pretty"
          externalExpansionState={outputExpansionState}
          onExternalExpansionChange={onOutputExpansionChange}
          hoverControls
        />
      )}
    </div>
  );
}

export interface IOPreviewPrettyProps extends ExpansionStateProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  status?: ObservationStatusMessage;
  metadata?: Prisma.JsonValue;
  outputCorrection?: ScoreDomain;
  // Pre-parsed data (optional, from useParsedObservation hook for performance)
  parsedInput?: unknown;
  parsedOutput?: unknown;
  parsedMetadata?: unknown;
  chatMLParserResult?: ChatMLParserResult;
  observationName?: string;
  isLoading?: boolean;
  isParsing?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  // Whether to show metadata section (default: false)
  showMetadata?: boolean;
  // Fixed-key attributes, rendered between Output and Metadata
  attributes?: Record<string, unknown>;
  attributesAnchorTime?: Date | null;
  modelParameters?: Record<string, unknown> | null;
  observationId?: string;
  projectId: string;
  traceId: string;
  environment?: string;
  showCorrections?: boolean;
  contentMode?: IOPreviewContentMode;
  showSystemPrompt?: boolean;
  // Which parser produces the preview; the normalized parser is admin-only
  // while it is being validated. Legacy remains the safe default.
  parser?: IOPreviewParserMode;
  // Called once after a normalized parser comparison has settled.
  onParserComparison?: (outcome: IOPreviewParserComparisonOutcome) => void;
}

/**
 * IOPreviewPretty - Renders input/output in pretty view mode.
 *
 * Features:
 * - ChatML message format detection and rendering
 * - Tool definitions and invocations display
 * - Large content safety (markdown rendering limit)
 * - Accepts pre-parsed data to avoid duplicate parsing
 *
 * This component selects and renders the pretty-view parser output. For JSON
 * view, use IOPreviewJSON instead.
 */
export function IOPreviewPretty({
  input,
  output,
  status,
  metadata,
  outputCorrection,
  parsedInput: preParsedInput,
  parsedOutput: preParsedOutput,
  parsedMetadata: preParsedMetadata,
  chatMLParserResult,
  observationName,
  isLoading = false,
  isParsing = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  inputExpansionState,
  outputExpansionState,
  metadataExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
  onMetadataExpansionChange,
  showMetadata = false,
  attributes,
  attributesAnchorTime,
  modelParameters,
  observationId,
  projectId,
  traceId,
  environment = "default",
  showCorrections = true,
  contentMode = "all",
  showSystemPrompt,
  parser = "legacy",
  onParserComparison,
}: IOPreviewPrettyProps) {
  // Use pre-parsed data if available (from useParsedObservation hook),
  // otherwise parse with size/depth limits to prevent UI freeze
  // IMPORTANT: Don't parse while isParsing=true to avoid double-parsing with different object references
  const parsedInput = isParsing
    ? undefined // Wait for Web Worker to finish
    : (preParsedInput ??
      deepParseJson(input, { maxSize: 300_000, maxDepth: 2 }));
  const parsedOutput = isParsing
    ? undefined
    : (preParsedOutput ??
      deepParseJson(output, { maxSize: 300_000, maxDepth: 2 }));
  const parsedMetadata = isParsing
    ? undefined
    : (preParsedMetadata ??
      deepParseJson(metadata, { maxSize: 100_000, maxDepth: 2 }));

  // Enable the metadata rows' actions menu (copy + add-to-filter). Observation
  // metadata filters the observations table; trace metadata the traces table.
  const metadataActions = useMemo<MetadataFilterActions>(
    () => ({
      projectId,
      filterTarget: observationId ? "observations" : "traces",
    }),
    [projectId, observationId],
  );

  // Parse into the shared preview contract. The normalized parser is opt-in
  // while it is being rolled out; legacy remains the safe default.
  const { result: parserResult, comparisonOutcome } = useIOPreviewParser(
    parser,
    input,
    output,
    metadata,
    observationName,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    chatMLParserResult,
  );

  const {
    allMessages,
    additionalInput,
    allTools,
    toolCallCounts,
    toolCallsByName,
    messageToToolCallNumbers,
    toolNameToDefinitionNumber,
    inputMessageCount,
  } = parserResult;

  const capturedComparisonRecord = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      parser !== "normalized" ||
      comparisonOutcome === undefined ||
      !onParserComparison ||
      isLoading ||
      isParsing
    ) {
      return;
    }

    const recordKey = `${observationId ? "observation" : "trace"}:${observationId ?? traceId}`;
    if (capturedComparisonRecord.current === recordKey) return;

    capturedComparisonRecord.current = recordKey;
    onParserComparison(comparisonOutcome);
  }, [
    comparisonOutcome,
    isLoading,
    isParsing,
    observationId,
    onParserComparison,
    parser,
    traceId,
  ]);

  const characterLimit = useMarkdownRenderCharacterLimit();

  // Determine if markdown is safe to render (content size check)
  const shouldRenderMarkdown = useMemo(() => {
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

    const shouldRender = totalSize <= characterLimit;

    return shouldRender;
  }, [parsedInput, parsedOutput, allMessages, characterLimit]);

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
    isParsing,
    media,
    hideIfNull,
    hideInput,
    hideOutput,
    inputExpansionState,
    outputExpansionState,
    onInputExpansionChange,
    onOutputExpansionChange,
  };

  // Determine if metadata should be shown
  const shouldShowMetadata = showMetadata && parsedMetadata !== undefined;
  const showData = contentMode !== "conversation";
  const shouldRenderMessages = hasRenderableChatMessages(parserResult);

  return (
    <div>
      {showData && status ? (
        <StatusMessageSection status={status} currentView="pretty" />
      ) : null}

      {showData && allTools.length > 0 ? (
        <SectionToolDefinitions
          tools={allTools}
          toolCallCounts={toolCallCounts}
          toolCallsByName={toolCallsByName}
          toolNameToDefinitionNumber={toolNameToDefinitionNumber}
        />
      ) : null}

      {shouldRenderMessages ? (
        <div className="mt-4 [&_.io-message-content]:px-3 [&_.io-message-header]:px-3">
          <ChatMessageList
            messages={allMessages}
            shouldRenderMarkdown={shouldRenderMarkdown}
            additionalInput={additionalInputToShow}
            media={media ?? []}
            currentView="pretty"
            messageToToolCallNumbers={messageToToolCallNumbers}
            inputMessageCount={inputMessageCount}
            contentMode={contentMode}
            showSystemPrompt={showSystemPrompt}
          />
          {showCorrections && (
            <CorrectedOutputField
              actualOutput={parsedOutput}
              existingCorrection={outputCorrection}
              observationId={observationId}
              projectId={projectId}
              traceId={traceId}
              environment={environment}
            />
          )}
        </div>
      ) : showData ? (
        <>
          <JsonInputOutputView {...jsonViewProps} />
          <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
            {showCorrections && (
              <CorrectedOutputField
                actualOutput={parsedOutput}
                existingCorrection={outputCorrection}
                observationId={observationId}
                projectId={projectId}
                traceId={traceId}
                environment={environment}
              />
            )}
          </div>
        </>
      ) : null}

      {/* Metadata Section */}
      {showData && attributes && Object.keys(attributes).length > 0 ? (
        <div className="mt-2 [&_.io-message-content]:px-3 [&_.io-message-header]:px-3">
          <PrettyJsonView
            hideHeader
            title="Attributes"
            json={attributes}
            currentView="pretty"
            metadataActions={{
              ...metadataActions,
              attributes: { anchorTime: attributesAnchorTime },
            }}
            hoverControls
          />
        </div>
      ) : null}
      {/* The LLM call's own parameters. Copy only: nothing here maps to a
          table column, unlike the attributes above. */}
      {showData && modelParameters ? (
        <div className="mt-2 [&_.io-message-content]:px-3 [&_.io-message-header]:px-3">
          <PrettyJsonView
            hideHeader
            title="Model parameters"
            json={modelParameters}
            currentView="pretty"
            hoverControls
          />
        </div>
      ) : null}

      {showData && shouldShowMetadata && (
        <div className="mt-4 [&_.io-message-content]:px-3 [&_.io-message-header]:px-3">
          <PrettyJsonView
            hideHeader
            title="Metadata"
            json={parsedMetadata}
            isLoading={isLoading}
            isParsing={isParsing}
            media={media?.filter((m) => m.field === "metadata") ?? []}
            currentView="pretty"
            externalExpansionState={metadataExpansionState}
            onExternalExpansionChange={onMetadataExpansionChange}
            metadataActions={metadataActions}
            hoverControls
          />
        </div>
      )}
    </div>
  );
}
