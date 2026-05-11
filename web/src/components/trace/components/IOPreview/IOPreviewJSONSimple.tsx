import { useMemo } from "react";
import { type Prisma, type ScoreDomain, deepParseJson } from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MediaReturnType } from "@/src/features/media/validation";
import { CorrectedOutputField } from "./components/CorrectedOutputField";

export interface IOPreviewJSONSimpleProps {
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  outputCorrection?: ScoreDomain;
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
  projectId: string;
  traceId: string;
  environment?: string;
  // Simple boolean expansion state (true = expanded, false = collapsed)
  inputExpanded?: boolean;
  outputExpanded?: boolean;
  metadataExpanded?: boolean;
  onInputExpandedChange?: (expanded: boolean) => void;
  onOutputExpandedChange?: (expanded: boolean) => void;
  onMetadataExpandedChange?: (expanded: boolean) => void;
  showCorrections?: boolean;
}

/**
 * IOPreviewJSONSimple - Renders input/output in legacy JSON view mode.
 *
 * Uses PrettyJsonView with currentView="json" which internally uses
 * the react18-json-view library (JSONView component).
 *
 * This is the "stable" JSON view that was used before the AdvancedJsonViewer
 * was introduced.
 *
 * LIMITATION: The react18-json-view library does NOT expose callbacks for
 * individual node expansion. Only global collapse/expand state (via the
 * fold/unfold button in the header) can be persisted. Per-node expansion
 * state is NOT saved when navigating between traces/observations.
 * Use Pretty view for full per-node expansion persistence.
 */
export function IOPreviewJSONSimple({
  input,
  output,
  metadata,
  outputCorrection,
  parsedInput,
  parsedOutput,
  parsedMetadata,
  isLoading = false,
  isParsing = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  inputExpanded,
  outputExpanded,
  metadataExpanded,
  onInputExpandedChange,
  onOutputExpandedChange,
  onMetadataExpandedChange,
  observationId,
  projectId,
  traceId,
  environment = "default",
  showCorrections = true,
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
          externalExpansionState={inputExpanded}
          // Cast: PrettyJsonView accepts union type, but JSON view only uses boolean
          onExternalExpansionChange={
            onInputExpandedChange as (
              expansion: boolean | Record<string, boolean>,
            ) => void
          }
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
          externalExpansionState={outputExpanded}
          onExternalExpansionChange={
            onOutputExpandedChange as (
              expansion: boolean | Record<string, boolean>,
            ) => void
          }
        />
      )}
      {showCorrections && (
        <CorrectedOutputField
          actualOutput={effectiveOutput}
          existingCorrection={outputCorrection}
          observationId={observationId}
          projectId={projectId}
          traceId={traceId}
          environment={environment}
        />
      )}
      {showMetadata && (
        <PrettyJsonView
          title="Metadata"
          json={metadata}
          parsedJson={effectiveMetadata}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "metadata") ?? []}
          currentView="json"
          externalExpansionState={metadataExpanded}
          onExternalExpansionChange={
            onMetadataExpandedChange as (
              expansion: boolean | Record<string, boolean>,
            ) => void
          }
        />
      )}
    </div>
  );
}
