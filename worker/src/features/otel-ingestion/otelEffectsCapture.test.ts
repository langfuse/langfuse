import { createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";
import {
  emitOtelEffect,
  hashOtelObservation,
  type OtelEffect,
} from "./otelEffectsCapture";
import {
  compareIntentCounts,
  createIntentCounts,
} from "./primaryOtelShadowCapture";

describe("OTEL shadow effect helpers", () => {
  it("canonicalizes object keys recursively but preserves array order", () => {
    const first = {
      nested: { b: 2, a: [{ z: true, y: "value" }] },
      list: ["first", "second"],
    };
    const reordered = {
      list: ["first", "second"],
      nested: { a: [{ y: "value", z: true }], b: 2 },
    };
    const reorderedArray = {
      nested: { a: [{ y: "value", z: true }], b: 2 },
      list: ["second", "first"],
    };

    expect(hashOtelObservation(first)).toBe(hashOtelObservation(reordered));
    expect(hashOtelObservation(first)).not.toBe(
      hashOtelObservation(reorderedArray),
    );
  });

  it("matches the shared digest for a canonical scalar payload", () => {
    const payload = { z: 1, a: "two" };
    const canonical = '{"a":"two","z":1}';

    expect(hashOtelObservation(payload)).toBe(
      createHash("sha256").update(canonical, "utf8").digest("base64"),
    );
  });

  it("does not let a capture hook failure escape ingestion", () => {
    const onCaptureFailure = vi.fn();
    const effect = {
      kind: "trace-recording",
      projectId: "project",
      traceId: "trace",
      spanStartTimeISO: "2026-11-19T00:00:00.000Z",
      ruleIds: [],
      serializedEventBytes: 1,
    } satisfies OtelEffect;

    expect(() =>
      emitOtelEffect(
        {
          capture: () => {
            throw new Error("capture failed");
          },
          onCaptureFailure,
        },
        effect,
      ),
    ).not.toThrow();
    expect(onCaptureFailure).toHaveBeenCalledOnce();
  });

  it("compares upstream eval stages even when enqueue fails downstream", () => {
    const primary = createIntentCounts();
    const native = createIntentCounts();

    primary.capture({
      kind: "eval-upsert",
      projectId: "project",
      jobExecutionId: "execution-primary",
      jobConfigurationId: "rule",
    });
    primary.capture({
      kind: "operation-failure",
      operation: "eval-enqueue",
      mode: "actual",
      projectId: "project",
      error: { type: "Error" },
    });
    native.capture({
      kind: "eval-blob-upload",
      projectId: "project",
      traceId: "trace",
      observationId: "span",
      observationHash: "digest-native",
    });
    native.capture({
      kind: "operation-failure",
      operation: "eval-enqueue",
      mode: "simulated",
      projectId: "project",
      error: { type: "Error" },
    });

    expect(compareIntentCounts(primary, native)).toEqual([
      { kind: "eval-upsert", missing: 1, extra: 0 },
      { kind: "eval-blob-upload", missing: 0, extra: 1 },
    ]);
    expect(primary.complete).toBe(false);
    expect(native.complete).toBe(false);
  });
});
