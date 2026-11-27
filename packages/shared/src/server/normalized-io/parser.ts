import type { EventRecordBaseType } from "../repositories/definitions";
import { metadataArraysToRecord } from "../utils/metadata_conversion";
import type { ResourceSpan } from "../otel/OtelIngestionProcessor";
import { normalizeSpanIO } from "../../utils/normalized-io";
import type { NormalizedIO, SpanIO } from "../../utils/normalized-io";

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
  return normalizeSpanIO(span);
}
