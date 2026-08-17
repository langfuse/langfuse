import type { ResourceSpan } from "../../../otel/OtelIngestionProcessor";
import type { SpanIO } from "../types";

type OtelScopeSpan = NonNullable<ResourceSpan["scopeSpans"]>[number];
export type OtelSpan = NonNullable<OtelScopeSpan["spans"]>[number];
export type OtelScope = OtelScopeSpan["scope"];

export type OtelSpanContext = {
  // The full instrumentation scope: name drives format detection, and
  // name/version/attributes all flow into SpanIO metadata.
  scope: OtelScope;
  resourceAttributes: Record<string, unknown>;
};

/**
 * OTel span -> SpanIO, one span (= one observation) at a time. Callers own
 * the resourceSpans -> scopeSpans -> spans iteration and pass the enclosing
 * scope and resource attributes as context.
 *
 * TODO: decide whether to extract the framework-specific raw
 * input/output/metadata discovery out of
 * OtelIngestionProcessor.extractInputAndOutput / extractMetadata into this
 * adapter (processor calls in), or reimplement it fresh here (processor
 * migrates later). Implement only after that decision.
 */
export function spanIOFromOtelSpan(
  _span: OtelSpan,
  _ctx: OtelSpanContext,
): SpanIO {
  throw new Error("spanIOFromOtelSpan is not implemented yet");
}
