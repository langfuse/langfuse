import { describe, expect, it } from "vitest";

import { getOtelIdRejectionReason, validateOtelSpanIds } from "./utils";

const TRACE_ID = "bb14c33c23138873afcc5e6f3c2b5f61"; // 16 bytes
const SPAN_ID = "cb00000daff4e5ae"; // 8 bytes
const traceBytes = Buffer.from(TRACE_ID, "hex");

describe("getOtelIdRejectionReason", () => {
  // Anything parseId can convert must stay accepted, otherwise this validation
  // breaks clients that ingest fine today. Length and encoding are not checked:
  // the OTLP protobuf declares these fields as `bytes` with no length
  // constraint, and the backend stores the id as a String.
  it.each([
    { shape: "hex string", value: TRACE_ID },
    { shape: "Buffer from a protobuf decode", value: traceBytes },
    { shape: "int array from the Python SDK", value: [...traceBytes] },
    { shape: "Uint8Array", value: new Uint8Array([...traceBytes]) },
    {
      shape: "Buffer serialized to JSON",
      value: { type: "Buffer", data: [...traceBytes] },
    },
    { shape: "base64 string", value: traceBytes.toString("base64") },
    { shape: "arbitrary non-hex string", value: "trace-1" },
    // Short, long and all-zero ids convert cleanly and the backend stores them
    // verbatim, so they are the client's business, not ours.
    { shape: "short id", value: Buffer.from([107]) },
    { shape: "span-length id in a traceId", value: SPAN_ID },
    { shape: "over-long id", value: Buffer.alloc(100, 7) },
    { shape: "all-zero id", value: Buffer.alloc(16) },
    { shape: "empty string", value: "" },
    { shape: "empty array", value: [] },
  ])("accepts $shape", ({ value }) => {
    expect(getOtelIdRejectionReason(value)).toBeNull();
  });

  // The production failure: parseId calls Buffer.from() on these and throws
  // ERR_INVALID_ARG_TYPE, which fails the queue job through every retry.
  it.each([
    { shape: "undefined", value: undefined, reason: "absent" },
    { shape: "null", value: null, reason: "absent" },
    { shape: "a number", value: 42, reason: "not_an_id" },
    { shape: "a boolean", value: true, reason: "not_an_id" },
    { shape: "a plain object", value: { foo: "bar" }, reason: "not_an_id" },
    // Buffer.from only revives the `{ type: "Buffer", data }` shape. The
    // worker's processToEvent path passes the raw value, so an untagged
    // envelope throws there even though other call sites unwrap `.data`.
    {
      shape: "an untagged data envelope",
      value: { data: [1, 2, 3, 4] },
      reason: "not_an_id",
    },
    // Buffer.from also accepts any object with a numeric `length` and
    // zero-fills that many bytes. Probing it here would let a tiny request body
    // block the shared web event loop for seconds, so array-likes are matched by
    // shape and rejected. If this ever regresses to calling Buffer.from, this
    // row starts passing the value through and the test fails.
    {
      shape: "a bare array-like",
      value: { length: 8 },
      reason: "not_an_id",
    },
  ] as const)("rejects $shape as $reason", ({ value, reason }) => {
    expect(getOtelIdRejectionReason(value)).toBe(reason);
  });
});

describe("validateOtelSpanIds", () => {
  const wrap = (spans: unknown[], scopeName = "my-tracer") => [
    {
      resource: { attributes: [] },
      scopeSpans: [{ scope: { name: scopeName }, spans }],
    },
  ];

  // The production failure: an OTLP log record decoded as a span. ResourceLogs
  // and ResourceSpans share protobuf field numbers, so the scope name comes
  // through intact while the ids are absent entirely. The worker-side crash this
  // causes is pinned by
  // worker/src/queues/__tests__/otelConversionFailureLogging.test.ts; this
  // asserts it no longer gets that far.
  it("rejects a log record decoded as a span", () => {
    const result = validateOtelSpanIds(
      wrap([{ traceState: "INFO" }], "codex_otel.log_only"),
    );
    expect(result.invalidSpanCount).toBe(1);
    // Both ids fail, so the per-reason counts sum above the span count.
    expect(result.reasonCounts).toEqual({
      "traceId:absent": 1,
      "spanId:absent": 1,
    });
    expect(result.scopeNames).toEqual(["codex_otel.log_only"]);
  });

  // The other decodable log-record shape yields 1- and 3-byte ids. Those convert
  // fine and the backend stores them verbatim, so they are deliberately accepted
  // rather than rejected on length — see getOtelIdRejectionReason.
  it("accepts a span whose ids are short but decodable", () => {
    const result = validateOtelSpanIds(
      wrap([
        {
          traceId: { type: "Buffer", data: [107] },
          spanId: { type: "Buffer", data: [10, 1, 118] },
        },
      ]),
    );
    expect(result).toMatchObject({ totalSpanCount: 1, invalidSpanCount: 0 });
  });

  // parentSpanId reaches parseId too, so a present-but-unconvertible one crashes
  // the worker exactly like a bad traceId. Absent is the common case and stays
  // valid, since the worker only converts it when truthy.
  it("rejects an unconvertible parentSpanId", () => {
    const result = validateOtelSpanIds(
      wrap([{ traceId: TRACE_ID, spanId: SPAN_ID, parentSpanId: 42 }]),
    );
    expect(result.invalidSpanCount).toBe(1);
    expect(result.reasonCounts).toEqual({ "parentSpanId:not_an_id": 1 });
  });

  it.each([
    { shape: "omitted", span: { traceId: TRACE_ID, spanId: SPAN_ID } },
    {
      shape: "an empty string",
      span: { traceId: TRACE_ID, spanId: SPAN_ID, parentSpanId: "" },
    },
    {
      shape: "a valid hex string",
      span: { traceId: TRACE_ID, spanId: SPAN_ID, parentSpanId: SPAN_ID },
    },
  ])("accepts a parentSpanId that is $shape", ({ span }) => {
    expect(validateOtelSpanIds(wrap([span])).invalidSpanCount).toBe(0);
  });

  // Doubles as the happy path: the two valid spans must not be flagged.
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
          spanId: 42,
        })),
      ]),
    );
    expect(result.invalidSpanCount).toBe(10);
    expect(result.reasonCounts).toEqual({
      "traceId:absent": 8,
      "spanId:not_an_id": 2,
    });
  });

  // Absent and empty collections are legitimate and must stay accepted.
  it.each([
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
      // Strings are iterable, so the worker walks the characters into zero
      // spans without throwing. Rejected anyway — one rule for these fields.
      shape: "string scopeSpans",
      payload: [{ scopeSpans: "nope" }],
      reason: "scopeSpans:not_an_array",
    },
    {
      shape: "object spans",
      payload: [{ scopeSpans: [{ spans: {} }] }],
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
