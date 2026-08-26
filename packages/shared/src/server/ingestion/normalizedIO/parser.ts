import type { EventRecordBaseType } from "../../repositories/definitions";
import { metadataArraysToRecord } from "../../utils/metadata_conversion";
import type { ResourceSpan } from "../../otel/OtelIngestionProcessor";
import {
  collectMessages,
  collectMetadataToolDefinitions,
  collectToolDefinitionsFromIO,
  createAccumulator,
} from "./core/containers";
import { asRecord, parseArray, parseIfString } from "./json";
import type { NormalizedIO, SpanIO } from "./types";

/**
 * Orchestration only: adapts a source into `SpanIO`, decodes exactly one
 * JSON-string boundary per value, and wires the container/message/part
 * discovery in `core/*.ts` together. Zero provider-specific vocabulary
 * lives in this file — every provider dialect is a fold over
 * `registeredProviders()` inside `core/*.ts`.
 */

type OtelScopeSpan = NonNullable<ResourceSpan["scopeSpans"]>[number];
export type OtelSpan = NonNullable<OtelScopeSpan["spans"]>[number];
export type OtelScope = OtelScopeSpan["scope"];

export type OtelSpanContext = {
  // The full instrumentation scope: name drives format detection, and
  // name/version/attributes all flow into SpanIO metadata.
  scope: OtelScope;
  resourceAttributes: Record<string, unknown>;
};

type EventRecordIOColumns = Pick<
  EventRecordBaseType,
  "input" | "output" | "metadata_names" | "metadata_values"
>;

export type NormalizeIOSource =
  | { kind: "event-record"; record: EventRecordIOColumns }
  | { kind: "io"; io: SpanIO }
  | { kind: "otel"; span: OtelSpan; context: OtelSpanContext };

type ParsedIOValue = {
  value: unknown;
  record?: Record<string, unknown>;
  messages?: unknown[];
};

type ParsedSpanIO = {
  input: ParsedIOValue;
  output: ParsedIOValue;
  metadata: unknown;
};

function parseIOValue(value: unknown): ParsedIOValue {
  const parsed = parseIfString(value);
  const record = asRecord(parsed);

  return {
    value: parsed,
    record,
    messages: Array.isArray(parsed)
      ? parsed
      : record
        ? parseArray(record.messages)
        : undefined,
  };
}

function parseSpanIO(span: SpanIO): ParsedSpanIO {
  return {
    input: parseIOValue(span.input),
    output: parseIOValue(span.output),
    metadata: parseIfString(span.metadata),
  };
}

/**
 * OTel span -> SpanIO, one span (= one observation) at a time.
 *
 * Framework-specific extraction is intentionally still a follow-up. The
 * ingestion processor remains the source of truth until that logic is moved
 * behind this private helper.
 */
function spanIOFromOtelSpan(_span: OtelSpan, _ctx: OtelSpanContext): SpanIO {
  throw new Error("spanIOFromOtelSpan is not implemented yet");
}

function toSpanIO(source: NormalizeIOSource): SpanIO {
  switch (source.kind) {
    case "event-record":
      return {
        input: source.record.input ?? null,
        output: source.record.output ?? null,
        metadata:
          metadataArraysToRecord(
            source.record.metadata_names,
            source.record.metadata_values,
          ) ?? null,
      };
    case "io":
      return source.io;
    case "otel":
      return spanIOFromOtelSpan(source.span, source.context);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function normalizeIO(source: NormalizeIOSource): NormalizedIO {
  const span = toSpanIO(source);
  const { input, output, metadata } = parseSpanIO(span);
  const accumulator = createAccumulator();

  collectMessages(input, "input", accumulator);
  collectMessages(output, "output", accumulator);

  collectToolDefinitionsFromIO(input, accumulator);
  collectToolDefinitionsFromIO(output, accumulator);
  collectMetadataToolDefinitions(metadata, accumulator);

  return {
    messages: accumulator.messages,
    toolDefinitions: accumulator.toolDefinitions,
    span,
  };
}
