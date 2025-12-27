import { useMemo } from "react";
import { type Prisma, type ScoreDomain, deepParseJson } from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type ExpansionStateProps } from "./IOPreview";
import { CorrectedOutputField } from "./components/CorrectedOutputField";

export interface IOPreviewJSONSimpleProps extends ExpansionStateProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  correctedOutput?: ScoreDomain;
  // Pre-parsed data (optional, from useParsedObservation hook for performance)
  parsedInput?: unknown;
  parsedOutput?: unknown;
  parsedMetadata?: unknown;
  isLoading?: boolean;
  isParsing?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  observationId?: string;
}

/**
 * IOPreviewJSONSimple - Renders input/output in legacy JSON view mode.
 *
 * Uses PrettyJsonView with currentView="json" which internally uses
 * the react18-json-view library (JSONView component).
 *
 * This is the "stable" JSON view that was used before the AdvancedJsonViewer
 * was introduced.
 */
export function IOPreviewJSONSimple({
  input,
  output,
  metadata,
  correctedOutput,
  parsedInput,
  parsedOutput,
  parsedMetadata,
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
}: IOPreviewJSONSimpleProps) {
  // Parse data if not pre-parsed
  // IMPORTANT: Don't parse while isParsing=true to avoid double-parsing with different object references
  const effectiveInput = useMemo(() => {
    if (isParsing) return undefined; // Wait for Web Worker to finish
    return parsedInput ?? deepParseJson(input);
  }, [parsedInput, input, isParsing]);

  const effectiveOutput = useMemo(() => {
    if (isParsing) return undefined;
    return parsedOutput ?? deepParseJson(output);
  }, [parsedOutput, output, isParsing]);

  const effectiveMetadata = useMemo(() => {
    if (isParsing) return undefined;
    return parsedMetadata ?? deepParseJson(metadata);
  }, [parsedMetadata, metadata, isParsing]);

  const showInput = !hideInput && !(hideIfNull && !effectiveInput);
  const showOutput = !hideOutput && !(hideIfNull && !effectiveOutput);
  const showMetadata = !(hideIfNull && !effectiveMetadata);

  return (
    <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
      {showInput && (
        <PrettyJsonView
          title="Input"
          json={input}
          parsedJson={effectiveInput}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "input") ?? []}
          currentView="json"
          externalExpansionState={inputExpansionState}
          onExternalExpansionChange={onInputExpansionChange}
        />
      )}
      {showOutput && (
        <PrettyJsonView
          title="Output"
          json={output}
          parsedJson={effectiveOutput}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "output") ?? []}
          currentView="json"
          externalExpansionState={outputExpansionState}
          onExternalExpansionChange={onOutputExpansionChange}
        />
      )}
      <CorrectedOutputField
        actualOutput={effectiveOutput}
        existingCorrection={correctedOutput}
        observationId={observationId}
      />
      {showMetadata && (
        <PrettyJsonView
          title="Metadata"
          json={metadata}
          parsedJson={effectiveMetadata}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "metadata") ?? []}
          currentView="json"
        />
      )}
    </div>
  );
}
