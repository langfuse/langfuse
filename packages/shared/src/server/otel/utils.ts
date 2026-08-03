export function isValidDateString(dateString: string): boolean {
  return !isNaN(new Date(dateString).getTime());
}

const OTEL_TRACE_ID_BYTES = 16;
const OTEL_SPAN_ID_BYTES = 8;
const HEX_ONLY = /^[0-9a-fA-F]+$/;

export type OtelIdKind = "traceId" | "spanId";

export type OtelIdRejectionReason =
  | "absent"
  | "not_an_id"
  | "wrong_length"
  /**
   * An all-zero id is invalid per the OTel spec. It is also actively harmful:
   * ingestion persists it as the entity id, so unrelated traces and
   * observations would collide on a single zero id and merge.
   */
  | "all_zero";

/**
 * Unwrap the `{ data: [...] }` envelope produced when a Buffer is serialized to
 * JSON, matching the `span.traceId?.data ?? span.traceId` handling in
 * OtelIngestionProcessor.
 */
function unwrapBufferEnvelope(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    "data" in value
  ) {
    return (value as { data: unknown }).data;
  }
  return value;
}

/**
 * Decide whether an OTLP trace/span id is usable, or why it is not.
 *
 * Returns null when the id is acceptable. Accepted wire shapes mirror the ones
 * OtelIngestionProcessor.parseId handles:
 *  - hex string (OTLP/JSON, JS SDK)
 *  - Buffer / Uint8Array (OTLP/protobuf decode)
 *  - number[] (the Python SDK sends int arrays)
 *  - { data: number[] } (Buffer serialized to JSON)
 *
 * Strings that are not hex are deliberately accepted: hex is the only
 * OTLP/JSON-compliant encoding, but other encodings (e.g. base64 from a
 * proto3-JSON mapping) already ingest successfully today and rejecting them
 * here would break working clients for a problem we have not observed.
 */
export function getOtelIdRejectionReason(
  value: unknown,
  kind: OtelIdKind,
): OtelIdRejectionReason | null {
  const expectedBytes =
    kind === "traceId" ? OTEL_TRACE_ID_BYTES : OTEL_SPAN_ID_BYTES;
  const unwrapped = unwrapBufferEnvelope(value);

  if (unwrapped === null || unwrapped === undefined) return "absent";

  if (typeof unwrapped === "string") {
    if (unwrapped.length === 0) return "absent";
    if (!HEX_ONLY.test(unwrapped)) return null;
    if (unwrapped.length !== expectedBytes * 2) return "wrong_length";
    return /^0+$/.test(unwrapped) ? "all_zero" : null;
  }

  if (unwrapped instanceof Uint8Array || Array.isArray(unwrapped)) {
    if (unwrapped.length !== expectedBytes) return "wrong_length";
    // Mirror how Buffer.from() coerces array entries, so an array of values
    // that all land on 0x00 is caught as well.
    const bytes = Array.from(unwrapped as Iterable<unknown>, (entry) => {
      const n = Number(entry);
      return Number.isFinite(n) ? n & 0xff : 0;
    });
    return bytes.every((byte) => byte === 0) ? "all_zero" : null;
  }

  // Numbers, booleans and plain objects reach Buffer.from() in parseId and
  // throw ERR_INVALID_ARG_TYPE there.
  return "not_an_id";
}

export interface OtelSpanIdValidationResult {
  totalSpanCount: number;
  invalidSpanCount: number;
  /**
   * Invalid spans per `<field>:<reason>` pair, e.g.
   * `{ "traceId:absent": 8, "spanId:wrong_length": 2 }`.
   *
   * A span with both a bad traceId and a bad spanId counts once under each, so
   * these can sum above `invalidSpanCount`. The key set is bounded by
   * construction (2 fields x the reason union), which is what makes it safe to
   * use as a metric tag and why it is not sampled.
   */
  reasonCounts: Record<string, number>;
  /** Deduped `<field>:<reason>` pairs, e.g. "traceId:absent". */
  reasons: string[];
  /** Deduped instrumentation scope names of the offending spans, sampled. */
  scopeNames: string[];
}

/**
 * Walk a decoded OTLP trace export and report spans whose traceId or spanId is
 * missing or malformed.
 *
 * These payloads cannot be converted downstream: parseId either throws
 * ERR_INVALID_ARG_TYPE (absent id) or yields a truncated id that produces a
 * bogus trace. The dominant real-world source is an OTLP *logs* export sent to
 * the traces endpoint — ResourceLogs and ResourceSpans share protobuf field
 * numbers, so log records decode into spans that carry a valid instrumentation
 * scope but no ids.
 */
export function validateOtelSpanIds(
  resourceSpans: unknown,
  { maxSamples = 5 }: { maxSamples?: number } = {},
): OtelSpanIdValidationResult {
  let totalSpanCount = 0;
  let invalidSpanCount = 0;
  const reasonCounts: Record<string, number> = {};
  const scopeNames = new Set<string>();

  if (!Array.isArray(resourceSpans)) {
    return {
      totalSpanCount,
      invalidSpanCount,
      reasonCounts,
      reasons: [],
      scopeNames: [],
    };
  }

  for (const resourceSpan of resourceSpans) {
    // Only iterate actual arrays. A `?? []` fallback still hands a non-nullish
    // non-iterable (`{}`, a number) to for...of, which throws — and this runs on
    // the request path, so that would surface as a 500 rather than a rejection.
    const scopeSpans = (resourceSpan as any)?.scopeSpans;
    if (!Array.isArray(scopeSpans)) continue;

    for (const scopeSpan of scopeSpans) {
      const spans = scopeSpan?.spans;
      if (!Array.isArray(spans)) continue;

      for (const span of spans) {
        totalSpanCount++;

        const spanReasons: string[] = [];
        for (const kind of ["traceId", "spanId"] as const) {
          const reason = getOtelIdRejectionReason(span?.[kind], kind);
          if (reason) spanReasons.push(`${kind}:${reason}`);
        }
        if (spanReasons.length === 0) continue;

        invalidSpanCount++;
        for (const reason of spanReasons) {
          reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
        }
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
