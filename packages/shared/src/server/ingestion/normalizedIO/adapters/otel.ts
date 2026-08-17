import type { SpanIO } from "../types";

/**
 * OTel span -> SpanIO. Not implemented yet.
 *
 * Framework-specific raw input/output/metadata discovery (Vercel AI SDK,
 * Logfire, TraceLoop, Pipecat, ~20 more) currently lives in
 * OtelIngestionProcessor.extractInputAndOutput / extractMetadata
 * (packages/shared/src/server/otel/OtelIngestionProcessor.ts). Whether this
 * adapter extracts that logic verbatim (with the processor calling into it)
 * or is written fresh and the processor migrates onto it later is an open
 * decision — see open question Q1 in the LFE-14998 interface plan. Land that
 * decision before implementing this adapter.
 */
export function spanIOFromOtelSpan(
  _span: unknown,
  _ctx: { resourceAttributes: Record<string, unknown>; scopeName: string },
): SpanIO {
  throw new Error("spanIOFromOtelSpan is not implemented yet (see Q1)");
}
