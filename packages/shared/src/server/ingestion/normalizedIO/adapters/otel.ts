import type { SpanIO } from "../types";

/**
 * OTel span -> SpanIO. Not implemented yet.
 *
 * TODO: decide whether to extract the framework-specific raw
 * input/output/metadata discovery out of
 * OtelIngestionProcessor.extractInputAndOutput / extractMetadata into this
 * adapter (processor calls in), or reimplement it fresh here (processor
 * migrates later). Implement only after that decision.
 */
export function spanIOFromOtelSpan(
  _span: unknown,
  _ctx: { resourceAttributes: Record<string, unknown>; scopeName: string },
): SpanIO {
  throw new Error("spanIOFromOtelSpan is not implemented yet");
}
