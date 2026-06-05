import { describe, expect, it } from "vitest";
import { createStableVirtualRowMeasurementState } from "@/src/components/session/stableVirtualRowMeasurementState";

describe("createStableVirtualRowMeasurementState", () => {
  it("clears stale pending height when a direct commit lands", () => {
    const measurement = createStableVirtualRowMeasurementState();

    expect(measurement.commitHeight(300, 0)).toBe(300);
    measurement.setPendingHeight(350);

    expect(measurement.commitHeight(320, 10)).toBe(320);
    expect(measurement.getSnapshot().pendingHeight).toBeNull();
    expect(measurement.commitPendingHeight(20)).toBeNull();
    expect(measurement.getSnapshot().committedHeight).toBe(320);
  });

  it("commits a deferred pending height only when pending height is consumed", () => {
    const measurement = createStableVirtualRowMeasurementState();

    measurement.setPendingHeight(350);

    expect(measurement.getSnapshot().committedHeight).toBeNull();
    expect(measurement.commitPendingHeight(0)).toBe(350);
    expect(measurement.getSnapshot().pendingHeight).toBeNull();
    expect(measurement.getSnapshot().committedHeight).toBe(350);
  });

  it("clears committed, pending, oscillation, and freeze state on reset", () => {
    const measurement = createStableVirtualRowMeasurementState();

    expect(measurement.commitHeight(100, 0)).toBe(100);
    expect(measurement.commitHeight(200, 100)).toBe(200);
    measurement.setPendingHeight(150);
    measurement.reset();

    expect(measurement.getSnapshot()).toEqual({
      committedHeight: null,
      pendingHeight: null,
      previousObservedHeight: null,
      oscillationPair: null,
      oscillationCount: 0,
      oscillationWindowStartedAt: 0,
      frozenMinHeight: null,
    });
  });

  it("ignores rounded no-op height changes", () => {
    const measurement = createStableVirtualRowMeasurementState();

    expect(measurement.commitHeight(100.2, 0)).toBe(101);
    expect(measurement.commitHeight(100.8, 10)).toBeNull();
    expect(measurement.getSnapshot().committedHeight).toBe(101);
  });

  it("clamps the observation that triggers repeated-height oscillation", () => {
    const measurement = createStableVirtualRowMeasurementState();

    expect(measurement.commitHeight(100, 0)).toBe(100);
    expect(measurement.commitHeight(200, 100)).toBe(200);
    expect(measurement.commitHeight(100, 200)).toBe(100);
    expect(measurement.commitHeight(200, 300)).toBe(200);

    expect(measurement.commitHeight(100, 400)).toBeNull();
    expect(measurement.getSnapshot()).toMatchObject({
      committedHeight: 200,
      frozenMinHeight: 200,
      oscillationCount: 4,
    });
  });

  it("allows legitimate growth after oscillation has been clamped", () => {
    const measurement = createStableVirtualRowMeasurementState();

    measurement.commitHeight(100, 0);
    measurement.commitHeight(200, 100);
    measurement.commitHeight(100, 200);
    measurement.commitHeight(200, 300);
    measurement.commitHeight(100, 400);

    expect(measurement.commitHeight(260, 500)).toBe(260);
    expect(measurement.getSnapshot().committedHeight).toBe(260);
  });
});
