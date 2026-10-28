/* eslint-disable no-nested-ternary */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ObservationType,
  type Prisma,
  type ScoreDomain,
  deepParseJson,
} from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type IOSectionAction } from "@/src/components/ui/IOSection";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { type MediaReturnType } from "@/src/features/media";
import { type ChatMLParserResult } from "../../hooks/useChatMLParser";
import {
  hasRenderableChatMessages,
  useIOPreviewParser,
} from "../../hooks/useIOPreviewParser";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { ChatMessageList, type ChatMessageListProps } from "../ChatMessageList";
import { SectionToolDefinitions } from "./components/SectionToolDefinitions";
import {
  SectionSkills,
  type SectionSkillsProps,
} from "./components/SectionSkills";
import {
  type ExpansionStateProps,
  type IOPreviewContentMode,
} from "./IOPreview";
import {
  CorrectedOutputField,
  useCorrectOutputAction,
} from "./components/CorrectedOutputField";
import { useCorrectionData } from "./hooks/useCorrectionData";
import {
  getMessageTitle,
  shouldRenderMessageForContentMode,
} from "@/src/features/traces/fns/chatMessageUtils";
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
  /** Extra header controls on the Output section. */
  outputActions?: IOSectionAction[];
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
  outputActions,
}: JsonInputOutputViewProps) {
  const showInput = !hideInput && !(hideIfNull && !parsedInput);
  const showOutput = !hideOutput && !(hideIfNull && !parsedOutput);

  return (
    <div className="space-y-2">
      {showInput && (
        <PrettyJsonView
          title="Input"
          json={parsedInput}
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
          actions={outputActions}
          externalExpansionState={outputExpansionState}
          onExternalExpansionChange={onOutputExpansionChange}
        />
      )}
    </div>
  );
}

function hasDeclaredRole(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { role?: unknown }).role === "string"
  );
}

/**
 * Chat I/O: a message array, bare or under `messages`, or a single message,
 * with at least one declared string `role`. Anything else is non-chat I/O
 * that the preview wraps into messages itself.
 */
function isChatIO(value: unknown): boolean {
  const messages =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as { messages?: unknown }).messages
      : value;
  if (Array.isArray(messages)) return messages.some(hasDeclaredRole);
  return hasDeclaredRole(value);
}

const SIDE_TITLES = { input: "Input", output: "Output" } as const;

export interface IOPreviewPrettyProps extends ExpansionStateProps {
  skills?: SectionSkillsProps["skills"];
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
  isLoading?: boolean;
  isParsing?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  observationId?: string;
  observationType?: ObservationType;
  projectId: string;
  traceId: string;
  environment?: string;
  showCorrections?: boolean;
  contentMode?: IOPreviewContentMode;
  showSystemPrompt?: boolean;
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
  skills,
  input,
  output,
  status,
  metadata,
  outputCorrection,
  parsedInput: preParsedInput,
  parsedOutput: preParsedOutput,
  parsedMetadata: preParsedMetadata,
  chatMLParserResult,
  isLoading = false,
  isParsing = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  inputExpansionState,
  outputExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
  observationId,
  observationType,
  projectId,
  traceId,
  environment = "default",
  showCorrections = true,
  contentMode = "all",
  showSystemPrompt,
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

  // Parse into the shared preview contract.
  const parserResult = useIOPreviewParser(
    input,
    output,
    metadata,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    chatMLParserResult,
  );

  const shouldRenderMessages = hasRenderableChatMessages(parserResult);

  useIOParserComparisonCapture({
    input,
    output,
    chatMLParserResult,
    isLoading,
    isParsing,
    observationId,
    traceId,
    shouldRenderMessages,
  });

  const {
    allMessages,
    additionalInput,
    allTools,
    toolCallCounts,
    toolCallsByName,
    messageToToolCallNumbers,
    inputMessageCount,
  } = parserResult;

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

  const showData = contentMode !== "conversation";
  // The "Correct output" pencil lives in the Output header; the field below
  // opens into its editor from there. Without an Output header (no output
  // message rendered) the field keeps its own inline trigger.
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const correctOutputAction = useCorrectOutputAction({
    projectId,
    onOpen: () => setCorrectionOpen(true),
  });
  const { effectiveCorrection } = useCorrectionData(
    outputCorrection,
    observationId,
    traceId,
  );
  const hasOutputHeader = shouldRenderMessages
    ? allMessages.some(
        (message, index) =>
          index >= (inputMessageCount ?? 0) &&
          shouldRenderMessageForContentMode(
            message,
            contentMode,
            showSystemPrompt,
          ),
      )
    : !hideOutput && !(hideIfNull && !parsedOutput);
  const correctionTrigger = hasOutputHeader ? "header" : "inline";
  const outputActions =
    showCorrections &&
    hasOutputHeader &&
    !correctionOpen &&
    !effectiveCorrection
      ? [correctOutputAction]
      : undefined;
  // In header mode the field mounts only while open or with a correction.
  const showCorrectionField =
    showCorrections &&
    (correctionTrigger === "inline" || correctionOpen || !!effectiveCorrection);
  const correctedOutputField = showCorrectionField ? (
    <CorrectedOutputField
      actualOutput={parsedOutput}
      existingCorrection={outputCorrection}
      observationId={observationId}
      projectId={projectId}
      traceId={traceId}
      environment={environment}
      trigger={correctionTrigger}
      startEditing={correctionOpen && !effectiveCorrection}
      onClosed={() => setCorrectionOpen(false)}
    />
  ) : null;
  // Non-generation I/O that is not chat (plain strings, loose records) is
  // titled Input / Output; declared chat roles keep their role titles on
  // every observation type. Generations always title by role.
  const canTitleBySide =
    observationType !== undefined && observationType !== "GENERATION";
  const titleBySide = {
    input: canTitleBySide && !isChatIO(parsedInput),
    output: canTitleBySide && !isChatIO(parsedOutput),
  };
  const messageTitle: ChatMessageListProps["getMessageTitle"] = (
    message,
    side,
  ) => (titleBySide[side] ? SIDE_TITLES[side] : getMessageTitle(message));

  return (
    <div className="space-y-2 pt-3">
      {showData && status ? (
        <StatusMessageSection status={status} currentView="pretty" />
      ) : null}

      {showData && allTools.length > 0 ? (
        <SectionToolDefinitions
          tools={allTools}
          toolCallCounts={toolCallCounts}
          toolCallsByName={toolCallsByName}
        />
      ) : null}

      {showData && skills && skills.items.length > 0 ? (
        <SectionSkills
          projectId={projectId}
          skills={skills}
          toolCallsByName={toolCallsByName}
        />
      ) : null}

      {shouldRenderMessages ? (
        <div>
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
            getMessageTitle={messageTitle}
            outputActions={outputActions}
          />
          {correctedOutputField}
        </div>
      ) : showData ? (
        <div>
          <JsonInputOutputView
            {...jsonViewProps}
            outputActions={outputActions}
          />
          {correctedOutputField}
        </div>
      ) : null}
    </div>
  );
}

/** Captures the normalization result for each displayed record. */
function useIOParserComparisonCapture({
  input,
  output,
  chatMLParserResult,
  isLoading,
  isParsing,
  observationId,
  traceId,
  shouldRenderMessages,
}: Pick<
  IOPreviewPrettyProps,
  | "input"
  | "output"
  | "chatMLParserResult"
  | "isLoading"
  | "isParsing"
  | "observationId"
  | "traceId"
> & { shouldRenderMessages: boolean }) {
  const capture = usePostHogClientCapture();
  const capturedNormalizationRecord = useRef<string | undefined>(undefined);

  /** Empty payloads are excluded from the normalization success metric. */
  const hasPayloadToNormalize =
    (input !== null && input !== undefined) ||
    (output !== null && output !== undefined);

  useEffect(() => {
    if (
      chatMLParserResult !== undefined ||
      !hasPayloadToNormalize ||
      isLoading ||
      isParsing
    ) {
      return;
    }

    const recordKey = `${observationId ? "observation" : "trace"}:${observationId ?? traceId}`;
    if (capturedNormalizationRecord.current === recordKey) return;

    capturedNormalizationRecord.current = recordKey;
    capture("trace_detail:io_parser_comparison", {
      isNormalizedSuccess: shouldRenderMessages,
    });
  }, [
    capture,
    chatMLParserResult,
    hasPayloadToNormalize,
    isLoading,
    isParsing,
    observationId,
    shouldRenderMessages,
    traceId,
  ]);
}
