import { describe, expect, it } from "vitest";

import {
  buildExecutionReceipt,
  canonicalJsonString,
  sha256HexOfCanonical,
  toSableSubmission,
  verifyExecutionReceipt,
  verifySableSubmission,
  type ExecutionReceiptInput,
} from "./executionReceipt";

const baseInput: ExecutionReceiptInput = {
  executionId: "exec-2026-09-11-langfuse-001",
  traceId: "trace-abc123",
  projectId: "project-xyz",
  goal: "Look up the order status and summarize it",
  claimedStatus: "success",
  finalReport: "Order 42 is shipped",
  environment: { region: "eu", sandbox: "public-example" },
  executor: {
    name: "langfuse-example-agent",
    version: "0.1.0",
    framework: "langfuse",
    frameworkVersion: "3.x",
    provider: "example-provider",
    model: "example-model-snapshot",
    revision: "git:abc1234",
  },
  toolCalls: [
    {
      tool: "get_order_status",
      args: { orderId: "42" },
      observedResult: { orderId: "42", status: "shipped" },
      observationId: "obs-001",
    },
  ],
  langfuseTraceUrl:
    "https://cloud.langfuse.com/project/project-xyz/traces/trace-abc123",
  capturedAt: "2026-09-11T12:00:00.000Z",
};

describe("executionReceipt canonicalization", () => {
  it("is stable regardless of key order", () => {
    expect(canonicalJsonString({ b: 1, a: { d: 4, c: 3 } })).toBe(
      canonicalJsonString({ a: { c: 3, d: 4 }, b: 1 }),
    );
  });

  it("matches sha256 over canonical utf8 bytes", () => {
    expect(sha256HexOfCanonical({ b: 1, a: 2 })).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256HexOfCanonical({ a: 2, b: 1 })).toBe(
      sha256HexOfCanonical({ b: 1, a: 2 }),
    );
  });

  it("matches Python json.dumps for cross-runtime floats", () => {
    // Python: json.dumps(v, sort_keys=True, separators=(",",":"),
    //                    ensure_ascii=False)
    // 1e-7 -> "1e-07" (not JS "1e-7"); 1e-6 -> "1e-06" (not JS "0.000001").
    expect(canonicalJsonString(1e-7)).toBe("1e-07");
    expect(canonicalJsonString(1e-6)).toBe("1e-06");
    expect(canonicalJsonString(0.00001)).toBe("1e-05");
    expect(canonicalJsonString(0.0001)).toBe("0.0001");
    expect(canonicalJsonString({ value: 1e-7 })).toBe('{"value":1e-07}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJsonString(Number.NaN)).toThrow();
    expect(() => canonicalJsonString(Number.POSITIVE_INFINITY)).toThrow();
    expect(() =>
      buildExecutionReceipt({
        ...baseInput,
        toolCalls: [
          {
            tool: "get_order_status",
            args: { score: Number.NaN },
            observedResult: { ok: true },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects non-JSON values (bigint) instead of throwing in stringify", () => {
    expect(() =>
      buildExecutionReceipt({
        ...baseInput,
        toolCalls: [
          {
            tool: "get_order_status",
            args: { big: 10n as unknown as string },
            observedResult: { ok: true },
          },
        ],
      }),
    ).toThrow();
  });

  it("normalizes Date consistently between hashing and export", () => {
    const withDate = {
      ...baseInput,
      toolCalls: [
        {
          tool: "get_order_status",
          args: {
            at: new Date("2026-09-11T12:00:00.000Z") as unknown as string,
          },
          observedResult: { ok: true },
        },
      ],
    };
    // Date is not JSON-native: input validation rejects it with a clear error
    // rather than hashing as {} and exporting as an ISO string.
    expect(() => buildExecutionReceipt(withDate)).toThrow();
    expect(canonicalJsonString(new Date("2026-09-11T12:00:00.000Z"))).toBe(
      '"2026-09-11T12:00:00.000Z"',
    );
  });
});

describe("buildExecutionReceipt", () => {
  it("builds a receipt that verifies", () => {
    const receipt = buildExecutionReceipt(baseInput);

    expect(receipt.protocolVersion).toBe("langfuse.execution-receipt.v1");
    expect(receipt.contentAddress).toBe(`sha256:${receipt.receiptHash}`);
    expect(verifyExecutionReceipt(receipt)).toEqual({ ok: true, reasons: [] });
  });

  it("detects tampering with the observed result", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const tampered = {
      ...receipt,
      toolCalls: [
        {
          ...receipt.toolCalls[0],
          observedResult: { orderId: "42", status: "refunded" },
        },
      ],
    };

    const result = verifyExecutionReceipt(tampered);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(
      "observed_result_hash_mismatch:get_order_status",
    );
  });

  it("requires at least one real tool call", () => {
    expect(() =>
      buildExecutionReceipt({ ...baseInput, toolCalls: [] }),
    ).toThrow();
  });

  it("rejects unknown top-level properties on verify (strict schema)", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const withExtra = { ...receipt, injected: "not-committed" };
    expect(
      verifyExecutionReceipt(
        withExtra as unknown as Parameters<typeof verifyExecutionReceipt>[0],
      ).ok,
    ).toBe(false);
  });

  it("rejects unknown nested properties on verify", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const withExtra = {
      ...receipt,
      executor: { ...receipt.executor, injected: "x" },
    };
    expect(
      verifyExecutionReceipt(
        withExtra as unknown as Parameters<typeof verifyExecutionReceipt>[0],
      ),
    ).toMatchObject({ ok: false, reasons: ["schema_mismatch"] });
  });

  it("rejects a supplied but invalid capturedAt instead of defaulting to now", () => {
    expect(() =>
      buildExecutionReceipt({ ...baseInput, capturedAt: "not-a-date" }),
    ).toThrow(/capturedAt/);
  });

  it("defaults capturedAt only when omitted", () => {
    const { capturedAt: _capturedAt, ...withoutTimestamp } = baseInput;
    void _capturedAt;
    const receipt = buildExecutionReceipt(withoutTimestamp);
    expect(new Date(receipt.provenance.capturedAt).getTime()).not.toBeNaN();
    expect(verifyExecutionReceipt(receipt).ok).toBe(true);
  });
});

describe("sable submission mapping", () => {
  it("emits a structurally valid envelope that verifies", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const submission = toSableSubmission(receipt);

    expect(submission.protocol_version).toBe("sable.submission.v0.9");
    expect(submission.submission_id).toBe(receipt.executionId);
    expect(verifySableSubmission(submission)).toEqual({
      ok: true,
      reasons: [],
    });
  });

  it("detects a tampered sable trace", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const submission = toSableSubmission(receipt);
    const tampered = {
      ...submission,
      trace: { ...submission.trace, goal: "altered goal" },
    };

    expect(verifySableSubmission(tampered)).toEqual({
      ok: false,
      reasons: ["source_trace_hash_mismatch"],
    });
  });

  it("refuses to convert a receipt with stale hashes", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const tampered = {
      ...receipt,
      toolCalls: [
        {
          ...receipt.toolCalls[0],
          observedResult: { orderId: "42", status: "refunded" },
        },
      ],
    };
    expect(() =>
      toSableSubmission(
        tampered as unknown as Parameters<typeof toSableSubmission>[0],
      ),
    ).toThrow(/invalid execution receipt/);
  });

  it("rejects unknown SABLE properties on verify", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const submission = toSableSubmission(receipt);
    const withExtra = { ...submission, injected: 1 };
    expect(
      verifySableSubmission(
        withExtra as unknown as Parameters<typeof verifySableSubmission>[0],
      ),
    ).toMatchObject({ ok: false, reasons: ["schema_mismatch"] });
  });

  it("sorts keys by Unicode code point like Python", () => {
    // JS UTF-16 order puts U+10000 before U+FFFD; Python code-point order
    // puts U+FFFD first. Canonical output must follow Python.
    const u10000 = String.fromCodePoint(0x10000);
    const ufffd = "�";
    expect(canonicalJsonString({ [u10000]: 1, [ufffd]: 2 })).toBe(
      `{"${ufffd}":2,"${u10000}":1}`,
    );
  });

  it("throws on undefined object values instead of dropping them", () => {
    expect(() => canonicalJsonString({ a: 1, b: undefined })).toThrow(
      /Undefined/,
    );
  });

  it("rejects hand-crafted receipts with invalid timestamps", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const { receiptHash, contentAddress, ...body } = receipt;
    void receiptHash;
    void contentAddress;
    const tamperedBody = {
      ...body,
      provenance: { ...body.provenance, capturedAt: "not-a-timestamp" },
    };
    const tampered = {
      ...tamperedBody,
      receiptHash: sha256HexOfCanonical(tamperedBody),
      contentAddress: `sha256:${sha256HexOfCanonical(tamperedBody)}`,
    };
    expect(
      verifyExecutionReceipt(
        tampered as unknown as Parameters<typeof verifyExecutionReceipt>[0],
      ),
    ).toMatchObject({ ok: false, reasons: ["schema_mismatch"] });
  });

  it("detects tampered SABLE state evidence", () => {
    const receipt = buildExecutionReceipt(baseInput);
    const submission = toSableSubmission(receipt);
    const tamperedStep = {
      ...submission.trace.steps[0],
      state_after: { tampered: true },
    };
    const tamperedTrace = {
      ...submission.trace,
      steps: [tamperedStep],
    };
    const tampered = {
      ...submission,
      trace: tamperedTrace,
      integrity: {
        ...submission.integrity,
        source_trace_hash: sha256HexOfCanonical(tamperedTrace),
      },
    };
    const result = verifySableSubmission(
      tampered as unknown as Parameters<typeof verifySableSubmission>[0],
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(
      "after_state_hash_mismatch:get_order_status",
    );
  });
});
