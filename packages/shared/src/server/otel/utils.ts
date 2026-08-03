export function isValidDateString(dateString: string): boolean {
  return !isNaN(new Date(dateString).getTime());
}

export type OtelIdRejectionReason = "absent" | "not_an_id";

/**
 * Whether an OTLP trace/span id can be converted by
 * OtelIngestionProcessor.parseId, which returns strings unchanged and otherwise
 * calls `Buffer.from()`. Returns null when it can.
 */
export function getOtelIdRejectionReason(
  value: unknown,
): OtelIdRejectionReason | null {
  if (value === null || value === undefined) return "absent";

  // parseId short-circuits on strings, so any string is convertible.
  if (typeof value === "string") return null;

  // Uint8Array/Buffer from a protobuf decode, int arrays from the Python SDK.
  if (value instanceof Uint8Array || Array.isArray(value)) return null;

  // A Buffer that has been through JSON. Matched explicitly rather than by
  // probing Buffer.from, which must never see attacker-controlled input on the
  // request path: it also accepts any object carrying a numeric `length` and
  // eagerly zero-fills that many bytes, so `{ length: 8e8 }` in a 94-byte body
  // would block the shared web event loop for seconds. Pathological array-likes
  // are therefore rejected here even though Buffer.from would accept them.
  if (
    typeof value === "object" &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return null;
  }

  // Numbers, booleans and every other object shape throw in Buffer.from —
  // including the untagged `{ data: [...] }` envelope, which the worker's
  // processToEvent path (OtelIngestionProcessor.ts:322) hands to parseId
  // without the `?.data` unwrap the other call sites apply.
  return "not_an_id";
}

export interface OtelSpanIdValidationResult {
  totalSpanCount: number;
  invalidSpanCount: number;
  /**
   * `scopeSpans`/`spans` fields that are present but not arrays. Counted
   * separately from `invalidSpanCount` because there is no span to attribute
   * them to — the collection that would hold the spans is itself unusable.
   */
  malformedCollectionCount: number;
  /**
   * Rejections per `<field>:<reason>` pair, e.g.
   * `{ "traceId:absent": 8, "spanId:not_an_id": 2 }`.
   *
   * A span with both a bad traceId and a bad spanId counts once under each, so
   * these can sum above `invalidSpanCount`. The key set is bounded by
   * construction (the id fields x the reason union, plus the two
   * `not_an_array` keys), which is what makes it safe to use as a metric tag
   * and why it is not sampled.
   */
  reasonCounts: Record<string, number>;
  /** Deduped `<field>:<reason>` pairs, e.g. "traceId:absent". */
  reasons: string[];
  /** Deduped instrumentation scope names of the offending spans, sampled. */
  scopeNames: string[];
}

/**
 * Walk a decoded OTLP trace export and report everything that makes it
 * unprocessable downstream: spans whose traceId, spanId or (when present)
 * parentSpanId cannot be converted, and `scopeSpans`/`spans` fields that are
 * present but not arrays.
 *
 * An unconvertible id throws ERR_INVALID_ARG_TYPE in parseId, failing the queue
 * job through every retry attempt. The dominant real-world source is an OTLP
 * *logs* export sent to the traces endpoint — ResourceLogs and ResourceSpans
 * share protobuf field numbers, so log records decode into spans that carry a
 * valid instrumentation scope but no ids at all.
 *
 * Non-array collections cannot be converted either: the worker iterates the
 * same fields behind a `?? []` fallback, which does not guard a non-nullish
 * non-array, so `for...of` throws there and the job fails through every retry.
 * Reporting them here lets the endpoint reject the payload instead. Absent and
 * empty collections stay valid — only a present, non-array value is a defect.
 */
export function validateOtelSpanIds(
  resourceSpans: unknown,
  { maxSamples = 5 }: { maxSamples?: number } = {},
): OtelSpanIdValidationResult {
  let totalSpanCount = 0;
  let invalidSpanCount = 0;
  let malformedCollectionCount = 0;
  const reasonCounts: Record<string, number> = {};
  const scopeNames = new Set<string>();

  const countReason = (reason: string) => {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  };

  if (!Array.isArray(resourceSpans)) {
    return {
      totalSpanCount,
      invalidSpanCount,
      malformedCollectionCount,
      reasonCounts,
      reasons: [],
      scopeNames: [],
    };
  }

  for (const resourceSpan of resourceSpans) {
    // Never hand a non-array to for...of: a `?? []` fallback does not guard a
    // non-nullish non-iterable (`{}`, a number), and this runs on the request
    // path, so throwing here would surface as a 500 rather than a rejection.
    const scopeSpans = (resourceSpan as any)?.scopeSpans;
    if (!Array.isArray(scopeSpans)) {
      if (scopeSpans !== null && scopeSpans !== undefined) {
        malformedCollectionCount++;
        countReason("scopeSpans:not_an_array");
      }
      continue;
    }

    for (const scopeSpan of scopeSpans) {
      const spans = scopeSpan?.spans;
      if (!Array.isArray(spans)) {
        if (spans !== null && spans !== undefined) {
          malformedCollectionCount++;
          countReason("spans:not_an_array");
          const malformedScope = scopeSpan?.scope?.name;
          if (malformedScope && scopeNames.size < maxSamples) {
            scopeNames.add(String(malformedScope));
          }
        }
        continue;
      }

      for (const span of spans) {
        totalSpanCount++;

        const spanReasons: string[] = [];
        for (const kind of ["traceId", "spanId"] as const) {
          const reason = getOtelIdRejectionReason(span?.[kind]);
          if (reason) spanReasons.push(`${kind}:${reason}`);
        }
        // parentSpanId is optional and the worker only converts it when truthy
        // (OtelIngestionProcessor.ts:325), so an absent one is legitimate and
        // only a present-but-unconvertible value crashes there.
        if (span?.parentSpanId) {
          const reason = getOtelIdRejectionReason(span.parentSpanId);
          if (reason) spanReasons.push(`parentSpanId:${reason}`);
        }
        if (spanReasons.length === 0) continue;

        invalidSpanCount++;
        spanReasons.forEach(countReason);
        const scopeName = scopeSpan?.scope?.name;
        if (scopeName && scopeNames.size < maxSamples) {
          scopeNames.add(String(scopeName));
        }
      }
    }
  }

  return {
    totalSpanCount,
    invalidSpanCount,
    malformedCollectionCount,
    reasonCounts,
    reasons: Object.keys(reasonCounts),
    scopeNames: [...scopeNames],
  };
}

/**
 * Flattens a nested JSON object into path-based names and string values.
 * For example: {foo: {bar: "baz", num: 42}} becomes:
 * - names: ["foo.bar", "foo.num"]
 * - values: ["baz", "42"]
 *
 * All values are converted to strings for consistent storage.
 */
export function flattenJsonToPathArrays(
  obj: Record<string, unknown>,
  prefix = "",
): { names: string[]; values: Array<string | null | undefined> } {
  const names: string[] = [];
  const values: Array<string | null | undefined> = [];

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      // Recursively flatten nested objects
      const nested = flattenJsonToPathArrays(
        value as Record<string, unknown>,
        path,
      );
      names.push(...nested.names);
      values.push(...nested.values);
    } else {
      // Leaf value - convert to string
      names.push(path);
      if (value === null || value === undefined || typeof value === "string") {
        values.push(value);
      } else {
        values.push(JSON.stringify(value));
      }
    }
  }

  return { names, values };
}
