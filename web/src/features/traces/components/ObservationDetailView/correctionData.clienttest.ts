import { describe, expect, it } from "vitest";
import { type ScoreDomain } from "@langfuse/shared";
import {
  selectOutputCorrections,
  isCorrectionOutputTooLarge,
} from "./correctionData";

const correction = (
  id: string,
  observationId: string | null,
  seconds: number,
) =>
  ({ id, observationId, timestamp: new Date(seconds * 1000) }) as ScoreDomain;

describe("correction data", () => {
  it("keeps trace-only corrections on their owner and separate from observation corrections", () => {
    const traceCorrection = correction("trace", null, 1);
    expect(selectOutputCorrections([traceCorrection], "root", true)).toEqual({
      outputCorrection: undefined,
      traceOutputCorrection: traceCorrection,
    });
    expect(selectOutputCorrections([traceCorrection], "child", false)).toEqual({
      outputCorrection: undefined,
      traceOutputCorrection: undefined,
    });
  });

  it("selects the newest correction independently without mutating the input", () => {
    const traceOld = correction("trace-old", null, 1);
    const observationLatest = correction("observation-latest", "root", 5);
    const traceLatest = correction("trace-latest", null, 3);
    const observationOld = correction("observation-old", "root", 2);
    const child = correction("child", "child", 6);
    const corrections = [
      traceOld,
      observationLatest,
      traceLatest,
      observationOld,
      child,
    ];
    const original = [...corrections];
    expect(selectOutputCorrections(corrections, "root", true)).toEqual({
      outputCorrection: observationLatest,
      traceOutputCorrection: traceLatest,
    });
    expect(selectOutputCorrections(corrections, "child", false)).toEqual({
      outputCorrection: child,
      traceOutputCorrection: undefined,
    });
    expect(corrections).toEqual(original);
  });

  it("enforces the character limit", () => {
    expect(isCorrectionOutputTooLarge("x".repeat(2_000_000))).toBe(false);
    expect(isCorrectionOutputTooLarge("x".repeat(2_000_001))).toBe(true);
  });

  it.each([false, true])(
    "counts structured rows (serialized: %s)",
    (serialized) => {
      const atLimit = Array.from({ length: 3332 }, () => 1);
      const overLimit = [...atLimit, 1];
      expect(
        isCorrectionOutputTooLarge(
          serialized ? JSON.stringify(atLimit) : atLimit,
        ),
      ).toBe(false);
      expect(
        isCorrectionOutputTooLarge(
          serialized ? JSON.stringify(overLimit) : overLimit,
        ),
      ).toBe(true);
    },
  );

  it("checks raw characters and worker-parsed rows independently", () => {
    expect(isCorrectionOutputTooLarge("x".repeat(2_000_001), "small")).toBe(
      true,
    );
    expect(
      isCorrectionOutputTooLarge(
        "small",
        Array.from({ length: 3333 }, () => 1),
      ),
    ).toBe(true);
  });
  it("accepts missing values and plain text", () => {
    expect(isCorrectionOutputTooLarge(undefined)).toBe(false);
    expect(isCorrectionOutputTooLarge("plain text")).toBe(false);
  });
});
