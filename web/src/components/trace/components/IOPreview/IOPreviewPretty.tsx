import { useMemo } from "react";
import { type Prisma, type ScoreDomain, deepParseJson } from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/utils/constants";
import { type MediaReturnType } from "@/src/features/media/validation";
import { useChatMLParser } from "./hooks/useChatMLParser";
import { ChatMessageList } from "./components/ChatMessageList";
import { SectionToolDefinitions } from "./components/SectionToolDefinitions";
import { type ExpansionStateProps } from "./IOPreview";
import { CorrectedOutputField } from "./components/CorrectedOutputField";

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
    <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
      {showInput && (
        <PrettyJsonView
          title="Input"
          json={parsedInput ?? null}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "input") ?? []}
          currentView="pretty"
          externalExpansionState={inputExpansionState}
          onExternalExpansionChange={onInputExpansionChange}
        />
      )}
      {showOutput && (
        <PrettyJsonView
          title="Output"
          json={parsedOutput}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "output") ?? []}
          currentView="pretty"
          externalExpansionState={outputExpansionState}
          onExternalExpansionChange={onOutputExpansionChange}
        />
      )}
    </div>
  );
}

export interface IOPreviewPrettyProps extends ExpansionStateProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  outputCorrection?: ScoreDomain;
  // Pre-parsed data (optional, from useParsedObservation hook for performance)
  parsedInput?: unknown;
  parsedOutput?: unknown;
  parsedMetadata?: unknown;
  observationName?: string;
  isLoading?: boolean;
  isParsing?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  // Whether to show metadata section (default: false)
  showMetadata?: boolean;
  observationId?: string;
  projectId: string;
  traceId: string;
  environment?: string;
  showCorrections?: boolean;
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
 * This component performs ChatML parsing which is only needed for pretty view.
 * For JSON view, use IOPreviewJSON instead.
 */
export function IOPreviewPretty({
  input,
  output,
  metadata,
  outputCorrection,
  parsedInput: preParsedInput,
  parsedOutput: preParsedOutput,
  parsedMetadata: preParsedMetadata,
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
  observationId,
  projectId,
  traceId,
  environment = "default",
  showCorrections = true,
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

  // Parse ChatML format
  const {
    canDisplayAsChat,
    allMessages,
    additionalInput,
    allTools,
    toolCallCounts,
    messageToToolCallNumbers,
    toolNameToDefinitionNumber,
    inputMessageCount,
  } = useChatMLParser(
    input,
    output,
    metadata,
    observationName,
    parsedInput,
    parsedOutput,
    parsedMetadata,
  );

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

    const shouldRender = totalSize <= MARKDOWN_RENDER_CHARACTER_LIMIT;

    return shouldRender;
  }, [parsedInput, parsedOutput, allMessages]);

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

  return (
    <div>
      <SectionToolDefinitions
        tools={allTools}
        toolCallCounts={toolCallCounts}
        toolNameToDefinitionNumber={toolNameToDefinitionNumber}
      />

      {canDisplayAsChat ? (
        <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
          <ChatMessageList
            messages={allMessages}
            shouldRenderMarkdown={shouldRenderMarkdown}
            additionalInput={additionalInputToShow}
            media={media ?? []}
            currentView="pretty"
            messageToToolCallNumbers={messageToToolCallNumbers}
            inputMessageCount={inputMessageCount}
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
      ) : (
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
      )}

      {/* Metadata Section */}
      {shouldShowMetadata && (
        <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
          <PrettyJsonView
            title="Metadata"
            json={parsedMetadata}
            isLoading={isLoading}
            isParsing={isParsing}
            media={media?.filter((m) => m.field === "metadata") ?? []}
            currentView="pretty"
            externalExpansionState={metadataExpansionState}
            onExternalExpansionChange={onMetadataExpansionChange}
          />
        </div>
      )}
    </div>
  );
}
