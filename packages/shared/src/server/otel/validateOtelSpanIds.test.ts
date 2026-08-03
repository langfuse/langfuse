import { describe, expect, it } from "vitest";

import { getOtelIdRejectionReason, validateOtelSpanIds } from "./utils";

const VALID_TRACE_ID = "bb14c33c23138873afcc5e6f3c2b5f61"; // 16 bytes
const VALID_SPAN_ID = "cb00000daff4e5ae"; // 8 bytes

function resourceSpans(scopeName: string, spans: unknown[]) {
  return [
    {
      resource: { attributes: [] },
      scopeSpans: [{ scope: { name: scopeName }, spans }],
    },
  ];
}

describe("getOtelIdRejectionReason", () => {
  it("accepts hex strings of the correct length", () => {
    expect(getOtelIdRejectionReason(VALID_TRACE_ID, "traceId")).toBeNull();
    expect(getOtelIdRejectionReason(VALID_SPAN_ID, "spanId")).toBeNull();
  });

  it("accepts Buffers of the correct length", () => {
    expect(
      getOtelIdRejectionReason(Buffer.from(VALID_TRACE_ID, "hex"), "traceId"),
    ).toBeNull();
    expect(
      getOtelIdRejectionReason(Buffer.from(VALID_SPAN_ID, "hex"), "spanId"),
    ).toBeNull();
  });

  it("accepts int arrays, as sent by the Python SDK", () => {
    expect(
      getOtelIdRejectionReason(
        [...Buffer.from(VALID_TRACE_ID, "hex")],
        "traceId",
      ),
    ).toBeNull();
  });

  it("accepts a Buffer serialized to JSON", () => {
    expect(
      getOtelIdRejectionReason(
        { type: "Buffer", data: [...Buffer.from(VALID_SPAN_ID, "hex")] },
        "spanId",
      ),
    ).toBeNull();
  });

  it("rejects absent ids", () => {
    expect(getOtelIdRejectionReason(undefined, "traceId")).toBe("absent");
    expect(getOtelIdRejectionReason(null, "spanId")).toBe("absent");
    expect(getOtelIdRejectionReason("", "traceId")).toBe("absent");
  });

  it("rejects ids of the wrong length", () => {
    expect(getOtelIdRejectionReason(Buffer.from([107]), "traceId")).toBe(
      "wrong_length",
    );
    expect(getOtelIdRejectionReason(VALID_SPAN_ID, "traceId")).toBe(
      "wrong_length",
    );
    expect(getOtelIdRejectionReason(VALID_TRACE_ID, "spanId")).toBe(
      "wrong_length",
    );
  });

  it("rejects values Buffer.from() cannot handle", () => {
    expect(getOtelIdRejectionReason(42, "traceId")).toBe("not_an_id");
    expect(getOtelIdRejectionReason({ foo: "bar" }, "spanId")).toBe(
      "not_an_id",
    );
  });

  it("passes through non-hex strings so existing clients keep working", () => {
    // base64 of a 16-byte id: not OTLP/JSON compliant, but ingests today.
    const base64 = Buffer.from(VALID_TRACE_ID, "hex").toString("base64");
    expect(getOtelIdRejectionReason(base64, "traceId")).toBeNull();
  });
});

describe("validateOtelSpanIds", () => {
  it("accepts a well-formed span", () => {
    const result = validateOtelSpanIds(
      resourceSpans("my-tracer", [
        { traceId: VALID_TRACE_ID, spanId: VALID_SPAN_ID, name: "op" },
      ]),
    );
    expect(result.invalidSpanCount).toBe(0);
    expect(result.totalSpanCount).toBe(1);
  });

  // Case A from the production failures: an OTLP LogRecord carrying only
  // severityText decodes as a Span with traceState set and no ids at all.
  it("rejects a log record decoded as a span with no ids", () => {
    const result = validateOtelSpanIds(
      resourceSpans("codex_otel.log_only", [{ traceState: "INFO" }]),
    );
    expect(result.invalidSpanCount).toBe(1);
    expect(result.reasons).toContain("traceId:absent");
    expect(result.reasons).toContain("spanId:absent");
    expect(result.scopeNames).toEqual(["codex_otel.log_only"]);
  });

  // Case B: a LogRecord carrying only attributes decodes into truncated ids,
  // which used to be ingested silently as a bogus trace.
  it("rejects truncated ids", () => {
    const result = validateOtelSpanIds(
      resourceSpans("uvicorn.access", [
        {
          traceId: { type: "Buffer", data: [107] },
          spanId: { type: "Buffer", data: [10, 1, 118] },
          kind: 8,
        },
      ]),
    );
    expect(result.invalidSpanCount).toBe(1);
    expect(result.reasons).toContain("traceId:wrong_length");
    expect(result.reasons).toContain("spanId:wrong_length");
  });

  it("counts only the offending spans in a mixed batch", () => {
    const result = validateOtelSpanIds(
      resourceSpans("mixed", [
        { traceId: VALID_TRACE_ID, spanId: VALID_SPAN_ID },
        { traceState: "INFO" },
        { traceId: VALID_TRACE_ID, spanId: VALID_SPAN_ID },
      ]),
    );
    expect(result.totalSpanCount).toBe(3);
    expect(result.invalidSpanCount).toBe(1);
  });

  it("tolerates empty, malformed and non-array payloads", () => {
    expect(validateOtelSpanIds([]).invalidSpanCount).toBe(0);
    expect(validateOtelSpanIds(undefined).invalidSpanCount).toBe(0);
    expect(validateOtelSpanIds([{}, null]).invalidSpanCount).toBe(0);
    expect(
      validateOtelSpanIds([{ scopeSpans: [{ scope: null, spans: null }] }])
        .invalidSpanCount,
    ).toBe(0);
  });

  it("caps the number of sampled reasons and scope names", () => {
    const many = Array.from({ length: 50 }, () => ({ traceState: "INFO" }));
    const result = validateOtelSpanIds(resourceSpans("scope", many), {
      maxSamples: 2,
    });
    expect(result.invalidSpanCount).toBe(50);
    expect(result.reasons.length).toBeLessThanOrEqual(2);
    expect(result.scopeNames.length).toBeLessThanOrEqual(2);
  });
});
