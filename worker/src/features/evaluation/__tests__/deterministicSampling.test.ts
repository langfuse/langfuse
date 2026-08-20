import { describe, expect, it } from "vitest";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../deterministicSampling";

describe("deterministic evaluation sampling", () => {
  it("maps a target ID to a stable value in the half-open unit interval", () => {
    expect(getDeterministicSamplingValue("obs-123")).toBe(0.6881281372814657);

    for (const targetId of ["", "obs-123", "trace-456"]) {
      const samplingValue = getDeterministicSamplingValue(targetId);

      expect(samplingValue).toBeGreaterThanOrEqual(0);
      expect(samplingValue).toBeLessThan(1);
      expect(getDeterministicSamplingValue(targetId)).toBe(samplingValue);
    }
  });

  it("creates nested samples as the sampling rate increases", () => {
    const samplingValue = getDeterministicSamplingValue("obs-123");

    expect(shouldSampleEvaluation({ samplingValue, samplingRate: 0.5 })).toBe(
      false,
    );
    expect(shouldSampleEvaluation({ samplingValue, samplingRate: 0.7 })).toBe(
      true,
    );
    expect(shouldSampleEvaluation({ samplingValue, samplingRate: 0.9 })).toBe(
      true,
    );
  });

  it("uses a half-open threshold and preserves zero and one boundaries", () => {
    const targetId = "obs-123";
    const samplingValue = getDeterministicSamplingValue(targetId);

    expect(shouldSampleEvaluation({ samplingValue, samplingRate: 0 })).toBe(
      false,
    );
    expect(shouldSampleEvaluation({ samplingValue, samplingRate: -0.1 })).toBe(
      false,
    );
    expect(
      shouldSampleEvaluation({ samplingValue, samplingRate: samplingValue }),
    ).toBe(false);
    expect(shouldSampleEvaluation({ samplingValue, samplingRate: 1 })).toBe(
      true,
    );
    expect(shouldSampleEvaluation({ samplingValue, samplingRate: 1.1 })).toBe(
      true,
    );
  });
});
