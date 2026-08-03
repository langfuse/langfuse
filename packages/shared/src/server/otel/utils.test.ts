import { describe, expect, it } from "vitest";

import { getOtelIdRejectionReason, validateOtelSpanIds } from "./utils";

const TRACE_ID = "bb14c33c23138873afcc5e6f3c2b5f61"; // 16 bytes
const SPAN_ID = "cb00000daff4e5ae"; // 8 bytes
const traceBytes = Buffer.from(TRACE_ID, "hex");
const spanBytes = Buffer.from(SPAN_ID, "hex");

describe("getOtelIdRejectionReason", () => {
  // Every wire shape OtelIngestionProcessor.parseId accepts has to stay valid,
  // otherwise this validation would reject clients that ingest fine today.
  it.each([
    { shape: "hex string", traceId: TRACE_ID, spanId: SPAN_ID },
    {
      shape: "Buffer (protobuf decode)",
      traceId: traceBytes,
      spanId: spanBytes,
    },
    {
      shape: "int array (Python SDK)",
      traceId: [...traceBytes],
      spanId: [...spanBytes],
    },
    {
      shape: "Buffer serialized to JSON",
      traceId: { type: "Buffer", data: [...traceBytes] },
      spanId: { type: "Buffer", data: [...spanBytes] },
    },
    {
      // Not OTLP/JSON compliant, but such clients ingest today, so they are
      // deliberately left alone rather than broken by this validation.
      shape: "non-hex string (e.g. base64)",
      traceId: traceBytes.toString("base64"),
      spanId: spanBytes.toString("base64"),
    },
  ])("accepts $shape", ({ traceId, spanId }) => {
    expect(getOtelIdRejectionReason(traceId, "traceId")).toBeNull();
    expect(getOtelIdRejectionReason(spanId, "spanId")).toBeNull();
  });

  it.each([
    { value: undefined, kind: "traceId", reason: "absent" },
    { value: null, kind: "spanId", reason: "absent" },
    { value: "", kind: "traceId", reason: "absent" },
    // A 1-byte id is what an OTLP log record decodes into, see below.
    { value: Buffer.from([107]), kind: "traceId", reason: "wrong_length" },
    { value: SPAN_ID, kind: "traceId", reason: "wrong_length" },
    { value: TRACE_ID, kind: "spanId", reason: "wrong_length" },
    // Values Buffer.from() cannot handle: parseId throws ERR_INVALID_ARG_TYPE.
    { value: 42, kind: "traceId", reason: "not_an_id" },
    { value: { foo: "bar" }, kind: "spanId", reason: "not_an_id" },
    // All-zero ids are spec-invalid and would make unrelated entities collide
    // on a single zero id.
    { value: "0".repeat(32), kind: "traceId", reason: "all_zero" },
    { value: "0".repeat(16), kind: "spanId", reason: "all_zero" },
    { value: Buffer.alloc(16), kind: "traceId", reason: "all_zero" },
    { value: new Array(8).fill(0), kind: "spanId", reason: "all_zero" },
    // Entries that coerce to 0x00 the same way Buffer.from() coerces them.
    { value: new Array(8).fill("x"), kind: "spanId", reason: "all_zero" },
  ] as const)(
    "rejects $value as $kind ($reason)",
    ({ value, kind, reason }) => {
      expect(getOtelIdRejectionReason(value, kind)).toBe(reason);
    },
  );
});

describe("validateOtelSpanIds", () => {
  const wrap = (spans: unknown[], scopeName = "my-tracer") => [
    {
      resource: { attributes: [] },
      scopeSpans: [{ scope: { name: scopeName }, spans }],
    },
  ];

  it("accepts a well-formed batch", () => {
    const result = validateOtelSpanIds(
      wrap([{ traceId: TRACE_ID, spanId: SPAN_ID, name: "op" }]),
    );
    expect(result).toMatchObject({ totalSpanCount: 1, invalidSpanCount: 0 });
  });

  // The two OTLP *log record* shapes that survive being decoded as spans:
  // ResourceLogs and ResourceSpans share protobuf field numbers, so the scope
  // name comes through intact while the ids do not.
  it.each([
    {
      shape: "log record with only severityText",
      span: { traceState: "INFO" },
      scopeName: "codex_otel.log_only",
      reasons: ["traceId:absent", "spanId:absent"],
    },
    {
      shape: "log record with only attributes (truncated ids)",
      span: {
        traceId: { type: "Buffer", data: [107] },
        spanId: { type: "Buffer", data: [10, 1, 118] },
        kind: 8,
      },
      scopeName: "uvicorn.access",
      reasons: ["traceId:wrong_length", "spanId:wrong_length"],
    },
  ])("rejects a $shape", ({ span, scopeName, reasons }) => {
    const result = validateOtelSpanIds(wrap([span], scopeName));
    expect(result.invalidSpanCount).toBe(1);
    expect(result.reasons).toEqual(expect.arrayContaining(reasons));
    expect(result.scopeNames).toEqual([scopeName]);
  });

  it("reports only the offending spans in a mixed batch", () => {
    const good = { traceId: TRACE_ID, spanId: SPAN_ID };
    const result = validateOtelSpanIds(
      wrap([good, { traceState: "INFO" }, good]),
    );
    expect(result).toMatchObject({ totalSpanCount: 3, invalidSpanCount: 1 });
  });

  // The rejection metric is tagged per reason, so a batch mixing reasons has to
  // split across them rather than attributing every span to the first reason.
  it("counts invalid spans per reason", () => {
    const result = validateOtelSpanIds(
      wrap([
        ...Array.from({ length: 8 }, () => ({ spanId: SPAN_ID })),
        ...Array.from({ length: 2 }, () => ({
          traceId: TRACE_ID,
          spanId: "0a0176",
        })),
      ]),
    );
    expect(result.invalidSpanCount).toBe(10);
    expect(result.reasonCounts).toEqual({
      "traceId:absent": 8,
      "spanId:wrong_length": 2,
    });
  });

  // A span can fail on both ids, so per-reason counts may exceed the span count.
  it("counts a span under each of its reasons", () => {
    const result = validateOtelSpanIds(wrap([{ traceState: "INFO" }]));
    expect(result.invalidSpanCount).toBe(1);
    expect(result.reasonCounts).toEqual({
      "traceId:absent": 1,
      "spanId:absent": 1,
    });
  });

  // Absent and empty collections are legitimate and must stay accepted.
  it.each([
    { shape: "empty array", payload: [] },
    { shape: "non-array", payload: undefined },
    { shape: "empty and null entries", payload: [{}, null] },
    {
      shape: "null scope and spans",
      payload: [{ scopeSpans: [{ scope: null, spans: null }] }],
    },
    { shape: "empty spans", payload: [{ scopeSpans: [{ spans: [] }] }] },
  ])("accepts $shape", ({ payload }) => {
    const result = validateOtelSpanIds(payload);
    expect(result.invalidSpanCount).toBe(0);
    expect(result.malformedCollectionCount).toBe(0);
  });

  // A present-but-non-array collection throws on for...of. The worker iterates
  // these same fields behind a `?? []` fallback that does not guard it, so the
  // job would fail through every retry — the failure mode this validation exists
  // to prevent. Report it so the endpoint rejects, and never throw here, since
  // that would surface as a 500.
  it.each([
    {
      shape: "object scopeSpans",
      payload: [{ scopeSpans: {} }],
      reason: "scopeSpans:not_an_array",
    },
    {
      shape: "numeric scopeSpans",
      payload: [{ scopeSpans: 42 }],
      reason: "scopeSpans:not_an_array",
    },
    {
      shape: "string scopeSpans",
      payload: [{ scopeSpans: "nope" }],
      reason: "scopeSpans:not_an_array",
    },
    {
      shape: "object spans",
      payload: [{ scopeSpans: [{ spans: {} }] }],
      reason: "spans:not_an_array",
    },
    {
      shape: "numeric spans",
      payload: [{ scopeSpans: [{ spans: 7 }] }],
      reason: "spans:not_an_array",
    },
  ])("reports $shape without throwing", ({ payload, reason }) => {
    expect(() => validateOtelSpanIds(payload)).not.toThrow();
    const result = validateOtelSpanIds(payload);
    expect(result.malformedCollectionCount).toBe(1);
    expect(result.reasons).toEqual([reason]);
    // No span was reachable, so nothing is attributed to a span.
    expect(result.invalidSpanCount).toBe(0);
    expect(result.totalSpanCount).toBe(0);
  });

  // Scope names are client-controlled and unbounded, so the samples that reach
  // the error message and the log line have to stay capped. Reasons are bounded
  // by construction and so are counted in full.
  it("caps sampled scope names but not reasons", () => {
    const resourceSpans = Array.from({ length: 50 }, (_unused, i) =>
      wrap([{ traceState: "INFO" }], `scope-${i}`),
    ).flat();
    const result = validateOtelSpanIds(resourceSpans, { maxSamples: 2 });
    expect(result.invalidSpanCount).toBe(50);
    expect(result.scopeNames.length).toBe(2);
    expect(result.reasonCounts).toEqual({
      "traceId:absent": 50,
      "spanId:absent": 50,
    });
  });
});
