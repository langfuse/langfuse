import { describe, expect, it } from "vitest";
import {
  classifyOtelShadowPair,
  reserveShadowInput,
  sampleOtelShadow,
  type OtelShadowOutcome,
} from "./otelShadowBatch";
import {
  compareIntentCounts,
  createIntentCounts,
  createOtelShadowCapture,
} from "./primaryOtelShadowCapture";
import type { EventRecordInsertType } from "@langfuse/shared/src/server";

describe("OTEL shadow batch admission", () => {
  it("keeps the same file on retries and earlier cohorts when increasing the sample", () => {
    const files = Array.from({ length: 10_000 }, (_, i) => `batch-${i}`);
    const cohort = (rate: number) =>
      files.filter((key) => sampleOtelShadow("project", key, rate));
    expect(cohort(0)).toEqual([]);
    expect(cohort(1)).toEqual(files);
    const first = cohort(0.001);
    expect(first.length).toBeGreaterThan(0);
    expect(cohort(0.001)).toEqual(first);
    expect(cohort(0.01)).toEqual(expect.arrayContaining(first));
    expect(cohort(0.05)).toEqual(expect.arrayContaining(cohort(0.01)));
  });

  it("skips new samples while all slots are held and reuses a released slot once", () => {
    const slots = Array.from({ length: 4 }, () => reserveShadowInput("[]"));
    try {
      expect(slots.every(Boolean)).toBe(true);
      expect(reserveShadowInput("[]")).toBeUndefined();
      slots[0]!.release();
      slots[0]!.release();
      const replacement = reserveShadowInput("[]");
      expect(replacement).toBeDefined();
      try {
        expect(reserveShadowInput("[]")).toBeUndefined();
      } finally {
        replacement?.release();
      }
    } finally {
      for (const slot of slots) slot?.release();
    }
  });

  it("releases a pending input slot on cancellation and keeps its own bytes", () => {
    const bytes = Buffer.from("masked");
    const hold = reserveShadowInput(bytes);
    expect(hold).toBeDefined();
    try {
      bytes.fill(0);
      expect(hold!.bytes.toString()).toBe("masked");
    } finally {
      hold!.release();
      hold!.release();
    }
  });
});

describe("OTEL shadow comparisons", () => {
  it("compares multiplicity even when traces or keys arrive out of order", () => {
    const primary = createIntentCounts();
    const rust = createIntentCounts();
    for (const key of ["x", "a", "x"]) primary.add("event", key);
    for (const key of ["a", "x", "b"]) rust.add("event", key);
    expect(compareIntentCounts(primary, rust)).toEqual([
      { kind: "event", missing: 1, extra: 1 },
    ]);
  });

  it("skips the whole comparison if any accepted primary row was dropped after a retry", async () => {
    const capture = createOtelShadowCapture();
    const row = { trace_id: "t", span_id: "s" } as EventRecordInsertType;
    capture.onEventWriteQueued(row);
    capture.onEventWriteTerminal({ status: "inserted", row });
    capture.onEventWriteQueued(row);
    const settled = capture.waitForPrimaryInserts();
    capture.onEventWriteTerminal({
      status: "dropped",
      row,
      error: new Error("insert failed"),
    });
    await expect(settled).resolves.toBe("dropped");
  });
});

describe("OTEL shadow coordinator outcomes", () => {
  it.each([
    ["exception", "inserted", "primary_only_failure"],
    ["dropped", "inserted", "primary_only_failure"],
    ["empty", "inserted", "primary_empty"],
    ["inserted", "exception", "shadow_only_failure"],
    ["inserted", "dropped", "shadow_only_failure"],
    ["inserted", "empty", "shadow_empty"],
    ["exception", "dropped", "both_failed"],
    ["empty", "empty", "both_empty"],
    ["inserted", "inserted", "match"],
  ] as const)(
    "classifies primary=%s and shadow=%s as %s",
    (primary, shadow, expected) => {
      expect(
        classifyOtelShadowPair(
          primary as OtelShadowOutcome,
          shadow as OtelShadowOutcome,
        ),
      ).toBe(expected);
    },
  );
});
