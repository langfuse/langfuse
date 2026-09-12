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
});
