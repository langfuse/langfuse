/**
 * @jest-environment jsdom
 */

import {
  calculateTimelineOffset,
  calculateTimelineWidth,
  calculateStepSize,
  getPredefinedStepSizes,
  SCALE_WIDTH,
  PREDEFINED_STEP_SIZES,
} from "./timeline-calculations";

describe("timeline-calculations", () => {
  describe("calculateTimelineOffset", () => {
    it("should return 0 for node starting at trace start", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:00Z");
      const totalDuration = 10; // 10 seconds

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );

      expect(offset).toBe(0);
    });

    it("should return SCALE_WIDTH for node starting at trace end", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:10Z"); // 10 seconds later
      const totalDuration = 10;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );

      expect(offset).toBe(SCALE_WIDTH);
    });

    it("should return half SCALE_WIDTH for node starting at trace midpoint", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:05Z"); // 5 seconds later
      const totalDuration = 10;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );

      expect(offset).toBe(SCALE_WIDTH / 2);
    });

    it("should handle custom scale width", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:05Z");
      const totalDuration = 10;
      const customWidth = 1800;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
        customWidth,
      );

      expect(offset).toBe(customWidth / 2);
    });

    it("should handle fractional seconds", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:00.500Z"); // 0.5 seconds later
      const totalDuration = 1;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );

      expect(offset).toBe(SCALE_WIDTH / 2);
    });
  });

  describe("calculateTimelineWidth", () => {
    it("should return 0 for zero duration", () => {
      const width = calculateTimelineWidth(0, 10);
      expect(width).toBe(0);
    });

    it("should return SCALE_WIDTH for duration equal to total span", () => {
      const width = calculateTimelineWidth(10, 10);
      expect(width).toBe(SCALE_WIDTH);
    });

    it("should return half SCALE_WIDTH for duration half of total span", () => {
      const width = calculateTimelineWidth(5, 10);
      expect(width).toBe(SCALE_WIDTH / 2);
    });

    it("should handle custom scale width", () => {
      const customWidth = 1800;
      const width = calculateTimelineWidth(5, 10, customWidth);
      expect(width).toBe(customWidth / 2);
    });

    it("should handle fractional durations", () => {
      const width = calculateTimelineWidth(0.5, 1);
      expect(width).toBe(SCALE_WIDTH / 2);
    });

    it("should handle very small durations", () => {
      const width = calculateTimelineWidth(0.001, 10);
      expect(width).toBe(SCALE_WIDTH * 0.0001);
    });
  });

  describe("calculateStepSize", () => {
    it("should select appropriate step size for short traces", () => {
      // 1 second trace should use small step size
      const stepSize = calculateStepSize(1);
      expect(stepSize).toBeLessThanOrEqual(1);
      expect(PREDEFINED_STEP_SIZES).toContain(stepSize);
    });

    it("should select appropriate step size for medium traces", () => {
      // 50 second trace
      const stepSize = calculateStepSize(50);
      expect(stepSize).toBeGreaterThan(1);
      expect(stepSize).toBeLessThanOrEqual(50);
      expect(PREDEFINED_STEP_SIZES).toContain(stepSize);
    });

    it("should select appropriate step size for long traces", () => {
      // 500 second trace
      const stepSize = calculateStepSize(500);
      expect(stepSize).toBeGreaterThan(10);
      expect(PREDEFINED_STEP_SIZES).toContain(stepSize);
    });

    it("should return largest step size for very long traces", () => {
      // 10000 second trace
      const stepSize = calculateStepSize(10000);
      expect(stepSize).toBe(
        PREDEFINED_STEP_SIZES[PREDEFINED_STEP_SIZES.length - 1],
      );
    });

    it("should return smallest applicable step size", () => {
      // For a 2 second trace, should select a step size >= calculated
      const stepSize = calculateStepSize(2);
      const calculatedStepSize = 2 / (SCALE_WIDTH / 100);
      expect(stepSize).toBeGreaterThanOrEqual(calculatedStepSize);
    });

    it("should handle custom scale width", () => {
      const customWidth = 1800;
      const stepSize = calculateStepSize(50, customWidth);
      expect(PREDEFINED_STEP_SIZES).toContain(stepSize);
    });

    it("should be consistent for same input", () => {
      const duration = 25;
      const stepSize1 = calculateStepSize(duration);
      const stepSize2 = calculateStepSize(duration);
      expect(stepSize1).toBe(stepSize2);
    });
  });

  describe("getPredefinedStepSizes", () => {
    it("should return array of step sizes", () => {
      const stepSizes = getPredefinedStepSizes();
      expect(Array.isArray(stepSizes)).toBe(true);
      expect(stepSizes.length).toBeGreaterThan(0);
    });

    it("should return a copy (not mutate original)", () => {
      const stepSizes = getPredefinedStepSizes();
      const originalLength = stepSizes.length;
      stepSizes.push(999);

      const stepSizes2 = getPredefinedStepSizes();
      expect(stepSizes2.length).toBe(originalLength);
      expect(stepSizes2).not.toContain(999);
    });

    it("should be in ascending order", () => {
      const stepSizes = getPredefinedStepSizes();
      for (let i = 1; i < stepSizes.length; i++) {
        expect(stepSizes[i]).toBeGreaterThan(stepSizes[i - 1]);
      }
    });

    it("should contain expected range of values", () => {
      const stepSizes = getPredefinedStepSizes();
      expect(stepSizes[0]).toBeLessThanOrEqual(1); // Has sub-second steps
      expect(stepSizes[stepSizes.length - 1]).toBeGreaterThanOrEqual(100); // Has large steps
    });
  });

  describe("Integration: offset + width should fit within trace", () => {
    it("should place a mid-trace observation correctly", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:03Z"); // starts at 3s
      const duration = 2; // lasts 2 seconds
      const totalDuration = 10;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );
      const width = calculateTimelineWidth(duration, totalDuration);

      // Should start at 30% of scale width
      expect(offset).toBe(SCALE_WIDTH * 0.3);
      // Should be 20% of scale width
      expect(width).toBe(SCALE_WIDTH * 0.2);
      // Should end at 50% of scale width
      expect(offset + width).toBe(SCALE_WIDTH * 0.5);
    });

    it("should handle observation at trace boundary", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:00Z");
      const duration = 10;
      const totalDuration = 10;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );
      const width = calculateTimelineWidth(duration, totalDuration);

      expect(offset).toBe(0);
      expect(width).toBe(SCALE_WIDTH);
      expect(offset + width).toBe(SCALE_WIDTH);
    });
  });

  describe("Edge cases", () => {
    it("calculateTimelineOffset should handle zero duration trace", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:00Z");
      const totalDuration = 0;

      // Should not throw, but result is undefined (division by zero)
      expect(() => {
        calculateTimelineOffset(nodeStart, traceStart, totalDuration);
      }).not.toThrow();
    });

    it("calculateStepSize should handle very small durations", () => {
      const stepSize = calculateStepSize(0.1);
      expect(stepSize).toBe(PREDEFINED_STEP_SIZES[0]); // Should use smallest step
    });

    it("calculateTimelineWidth should handle duration larger than total span", () => {
      // This shouldn't happen in practice, but handle gracefully
      const width = calculateTimelineWidth(20, 10);
      expect(width).toBe(SCALE_WIDTH * 2); // Just calculates proportionally
    });
  });
});
