import { useMemo } from "react";
import { type Prisma, type ScoreDomain, deepParseJson } from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MediaReturnType } from "@/src/features/media/validation";
import { CorrectedOutputField } from "./components/CorrectedOutputField";
import { LargeJsonFieldFallback } from "./components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  probeJsonField,
} from "./lib/jsonViewSizeGate";

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
  // Size-gate each field: the JSON view renders through react18-json-view,
  // which is not virtualized, so multi-MB payloads freeze and crash the tab
  // (LFE-10989). Probe the raw prop — it drives both the main-thread parse
  // below and the tree the viewer would build — and above the limit render a
  // bounded preview + download instead. The probe serializes an object field
  // exactly once (memoized) and the resulting string is reused for the size
  // check, the preview, and the download, so we never re-serialize the payload.
  const inputProbe = useMemo(() => probeJsonField(input), [input]);
  const outputProbe = useMemo(() => probeJsonField(output), [output]);
  const metadataProbe = useMemo(() => probeJsonField(metadata), [metadata]);

  const inputTooLarge = inputProbe.size > JSON_VIEW_RENDER_CHAR_LIMIT;
  const outputTooLarge = outputProbe.size > JSON_VIEW_RENDER_CHAR_LIMIT;
  const metadataTooLarge = metadataProbe.size > JSON_VIEW_RENDER_CHAR_LIMIT;

  // Parse data if not pre-parsed
  // IMPORTANT: Don't parse while isParsing=true to avoid double-parsing with different object references
  // Skip parsing entirely for over-limit fields: parsing a ~20 MB string in
  // deepParseJson (parsePreservingPrecision) blocks the main thread for seconds.
  const effectiveInput = useMemo(() => {
    if (isParsing) return undefined; // Wait for Web Worker to finish
    if (inputTooLarge) return undefined;
    return parsedInput ?? deepParseJson(input);
  }, [parsedInput, input, isParsing, inputTooLarge]);

  const effectiveOutput = useMemo(() => {
    if (isParsing) return undefined;
    if (outputTooLarge) return undefined;
    return parsedOutput ?? deepParseJson(output);
  }, [parsedOutput, output, isParsing, outputTooLarge]);

  const effectiveMetadata = useMemo(() => {
    if (isParsing) return undefined;
    if (metadataTooLarge) return undefined;
    return parsedMetadata ?? deepParseJson(metadata);
  }, [parsedMetadata, metadata, isParsing, metadataTooLarge]);

  // An over-limit field parses to `undefined` above, but it is not empty — it
  // is too big. Treat it as present so `hideIfNull` callers still show the
  // fallback instead of silently dropping the field.
  const showInput =
    !hideInput && (inputTooLarge || !(hideIfNull && !effectiveInput));
  const showOutput =
    !hideOutput && (outputTooLarge || !(hideIfNull && !effectiveOutput));
  const showMetadata = metadataTooLarge || !(hideIfNull && !effectiveMetadata);

  const downloadName = observationId ?? traceId;

  return (
    <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
      {showInput &&
        (inputTooLarge ? (
          <LargeJsonFieldFallback
            title="Input"
            serialized={inputProbe.serialized}
            isString={inputProbe.isString}
            charCount={inputProbe.size}
            downloadFileBase={`input-${downloadName}`}
          />
        ) : (
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
        ))}
      {showOutput &&
        (outputTooLarge ? (
          <LargeJsonFieldFallback
            title="Output"
            serialized={outputProbe.serialized}
            isString={outputProbe.isString}
            charCount={outputProbe.size}
            downloadFileBase={`output-${downloadName}`}
          />
        ) : (
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
        ))}
      {/* When the output is over-limit, effectiveOutput is undefined, so the
          correction editor opens without a baseline actual-output to diff
          against — an acceptable degradation for payloads too large to render. */}
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
      {showMetadata &&
        (metadataTooLarge ? (
          <LargeJsonFieldFallback
            title="Metadata"
            serialized={metadataProbe.serialized}
            isString={metadataProbe.isString}
            charCount={metadataProbe.size}
            downloadFileBase={`metadata-${downloadName}`}
          />
        ) : (
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
        ))}
    </div>
  );
}
