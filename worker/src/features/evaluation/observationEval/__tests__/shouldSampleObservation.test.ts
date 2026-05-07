import { describe, it, expect } from "vitest";
import { shouldSampleObservation } from "../shouldSampleObservation";

describe("shouldSampleObservation", () => {
  describe("edge cases", () => {
    it("should always return true when samplingRate is 1", () => {
      // Even with random values near the boundary, sampling rate 1 should always pass
      expect(shouldSampleObservation({ samplingRate: 1, randomValue: 0 })).toBe(
        true,
      );
      expect(
        shouldSampleObservation({ samplingRate: 1, randomValue: 0.5 }),
      ).toBe(true);
      expect(
        shouldSampleObservation({ samplingRate: 1, randomValue: 0.999 }),
      ).toBe(true);
    });

    it("should always return true when samplingRate is greater than 1", () => {
      // Values > 1 should be treated as 100% sampling
      expect(
        shouldSampleObservation({ samplingRate: 1.5, randomValue: 0.999 }),
      ).toBe(true);
      expect(
        shouldSampleObservation({ samplingRate: 100, randomValue: 0.999 }),
      ).toBe(true);
    });

    it("should always return false when samplingRate is 0", () => {
      expect(shouldSampleObservation({ samplingRate: 0, randomValue: 0 })).toBe(
        false,
      );
      expect(
        shouldSampleObservation({ samplingRate: 0, randomValue: 0.5 }),
      ).toBe(false);
      expect(
        shouldSampleObservation({ samplingRate: 0, randomValue: 0.001 }),
      ).toBe(false);
    });

    it("should always return false when samplingRate is negative", () => {
      // Negative values should be treated as 0% sampling
      expect(
        shouldSampleObservation({ samplingRate: -0.5, randomValue: 0 }),
      ).toBe(false);
      expect(
        shouldSampleObservation({ samplingRate: -1, randomValue: 0 }),
      ).toBe(false);
    });
  });

  describe("sampling behavior", () => {
    it("should return true when randomValue is less than samplingRate", () => {
      expect(
        shouldSampleObservation({ samplingRate: 0.5, randomValue: 0.3 }),
      ).toBe(true);
      expect(
        shouldSampleObservation({ samplingRate: 0.8, randomValue: 0.7 }),
      ).toBe(true);
      expect(
        shouldSampleObservation({ samplingRate: 0.1, randomValue: 0.05 }),
      ).toBe(true);
    });

    it("should return false when randomValue is greater than or equal to samplingRate", () => {
      expect(
        shouldSampleObservation({ samplingRate: 0.5, randomValue: 0.7 }),
      ).toBe(false);
      expect(
        shouldSampleObservation({ samplingRate: 0.3, randomValue: 0.5 }),
      ).toBe(false);
      expect(
        shouldSampleObservation({ samplingRate: 0.5, randomValue: 0.5 }),
      ).toBe(false);
    });

    it("should handle boundary values correctly", () => {
      // Just below the threshold - should pass
      expect(
        shouldSampleObservation({ samplingRate: 0.5, randomValue: 0.4999 }),
      ).toBe(true);

      // At the threshold - should not pass (using strict less than)
      expect(
        shouldSampleObservation({ samplingRate: 0.5, randomValue: 0.5 }),
      ).toBe(false);

      // Just above the threshold - should not pass
      expect(
        shouldSampleObservation({ samplingRate: 0.5, randomValue: 0.5001 }),
      ).toBe(false);
    });
  });

  describe("default random value", () => {
    it("should use Math.random when randomValue is not provided", () => {
      // Run multiple times to verify it uses randomness
      // With sampling rate of 1, should always return true
      for (let i = 0; i < 10; i++) {
        expect(shouldSampleObservation({ samplingRate: 1 })).toBe(true);
      }

      // With sampling rate of 0, should always return false
      for (let i = 0; i < 10; i++) {
        expect(shouldSampleObservation({ samplingRate: 0 })).toBe(false);
      }
    });
  });

  describe("probabilistic correctness", () => {
    it("should sample approximately the correct percentage over many iterations", () => {
      const samplingRate = 0.3;
      const iterations = 1000;
      let sampledCount = 0;

      // Use deterministic "random" values spread across [0, 1)
      for (let i = 0; i < iterations; i++) {
        const randomValue = i / iterations;
        if (shouldSampleObservation({ samplingRate, randomValue })) {
          sampledCount++;
        }
      }

      // With evenly distributed random values, exactly 30% should be sampled
      // (all values from 0 to 0.299 will pass, which is 300 values)
      expect(sampledCount).toBe(Math.floor(iterations * samplingRate));
    });
  });
});
