import { logger, recordIncrement } from "../";

/**
 * Sums the byte length of every string value in a raw OTEL span's
 * `span.attributes` and `span.events[].attributes`.
 *
 * Returns early once `earlyExitBytes` is exceeded — the caller only needs
 * to know "over the limit", not the exact total.
 */
export function estimateOtelSpanStringBytes(
  span: any,
  earlyExitBytes?: number,
): number {
  let total = 0;
  total = sumStringBytes(span?.attributes, total, earlyExitBytes);
  if (earlyExitBytes && total > earlyExitBytes) return total;
  for (const event of span?.events ?? []) {
    total = sumStringBytes(event?.attributes, total, earlyExitBytes);
    if (earlyExitBytes && total > earlyExitBytes) return total;
  }
  return total;
}

function sumStringBytes(
  attrs: any[] | undefined | null,
  total: number,
  earlyExitBytes?: number,
): number {
  for (const attr of attrs ?? []) {
    const val = attr?.value?.stringValue;
    if (typeof val === "string") {
      total += Buffer.byteLength(val, "utf8");
      if (earlyExitBytes && total > earlyExitBytes) return total;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// HTTP-layer oversized span filter
// ---------------------------------------------------------------------------

export interface FilterOversizedSpansResult {
  resourceSpans: any[];
  rejectedCount: number;
}

/**
 * Returns a filtered copy of `resourceSpans` with oversized spans removed
 * and empty containers pruned. Emits a summary log + metric when spans are
 * dropped.
 */
export function filterOversizedSpans(
  resourceSpans: any[],
  maxBytes: number,
  projectId: string,
): FilterOversizedSpansResult {
  let rejectedCount = 0;

  const filtered = resourceSpans
    .map((rs) => {
      const scopeSpans = (rs?.scopeSpans ?? [])
        .map((ss: any) => {
          const before = ss.spans?.length ?? 0;
          const spans = (ss.spans ?? []).filter(
            (span: any) =>
              estimateOtelSpanStringBytes(span, maxBytes) <= maxBytes,
          );
          rejectedCount += before - spans.length;
          return { ...ss, spans };
        })
        .filter((ss: any) => ss.spans.length > 0);
      return { ...rs, scopeSpans };
    })
    .filter((rs: any) => rs.scopeSpans.length > 0);

  if (rejectedCount > 0) {
    logger.warn("Dropped oversized OTEL spans at HTTP ingest", {
      projectId,
      rejectedCount,
    });
    recordIncrement(
      "langfuse.ingestion.otel.http_rejected_oversized_span",
      rejectedCount,
      { project_id: projectId },
    );
  }

  return { resourceSpans: filtered, rejectedCount };
}
