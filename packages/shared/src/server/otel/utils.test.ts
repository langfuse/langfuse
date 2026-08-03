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

  it.each([
    { shape: "empty array", payload: [] },
    { shape: "non-array", payload: undefined },
    { shape: "empty and null entries", payload: [{}, null] },
    {
      shape: "null scope and spans",
      payload: [{ scopeSpans: [{ scope: null, spans: null }] }],
    },
  ])("tolerates $shape", ({ payload }) => {
    expect(validateOtelSpanIds(payload).invalidSpanCount).toBe(0);
  });

  // Payloads can carry very many spans, so the samples that reach the error
  // message and the log line have to stay bounded.
  it("caps sampled reasons and scope names", () => {
    const spans = Array.from({ length: 50 }, () => ({ traceState: "INFO" }));
    const result = validateOtelSpanIds(wrap(spans), { maxSamples: 2 });
    expect(result.invalidSpanCount).toBe(50);
    expect(result.reasons.length).toBeLessThanOrEqual(2);
    expect(result.scopeNames.length).toBeLessThanOrEqual(2);
  });
});
