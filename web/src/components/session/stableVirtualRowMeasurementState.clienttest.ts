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

  it("keeps a frozen shrink clamped while the oscillation window is active", () => {
    const measurement = createStableVirtualRowMeasurementState();

    measurement.commitHeight(100, 0);
    measurement.commitHeight(200, 100);
    measurement.commitHeight(100, 200);
    measurement.commitHeight(200, 300);
    measurement.commitHeight(100, 400);

    expect(measurement.commitHeight(100, 500)).toBeNull();
    expect(measurement.getSnapshot()).toMatchObject({
      committedHeight: 200,
      frozenMinHeight: 200,
    });
  });

  it("keeps sustained oscillation clamped across the rolling window", () => {
    const measurement = createStableVirtualRowMeasurementState();

    expect(measurement.commitHeight(100, 0)).toBe(100);
    expect(measurement.commitHeight(200, 16)).toBe(200);
    expect(measurement.commitHeight(100, 32)).toBe(100);
    expect(measurement.commitHeight(200, 48)).toBe(200);
    expect(measurement.commitHeight(100, 64)).toBeNull();

    for (let now = 80; now <= 2_000; now += 16) {
      const height = now % 32 === 0 ? 100 : 200;

      expect(measurement.commitHeight(height, now)).toBeNull();
    }

    expect(measurement.getSnapshot()).toMatchObject({
      committedHeight: 200,
      frozenMinHeight: 200,
    });
  });

  it("releases a frozen shrink after the oscillation window expires", () => {
    const measurement = createStableVirtualRowMeasurementState();

    measurement.commitHeight(100, 0);
    measurement.commitHeight(200, 100);
    measurement.commitHeight(100, 200);
    measurement.commitHeight(200, 300);
    measurement.commitHeight(100, 400);

    expect(measurement.commitHeight(100, 1_500)).toBe(100);
    expect(measurement.getSnapshot()).toMatchObject({
      committedHeight: 100,
      frozenMinHeight: null,
      oscillationPair: null,
      oscillationCount: 0,
      oscillationWindowStartedAt: 0,
    });
  });

  it("clears stale frozen state after the oscillation window expires", () => {
    const measurement = createStableVirtualRowMeasurementState();

    measurement.commitHeight(100, 0);
    measurement.commitHeight(200, 100);
    measurement.commitHeight(100, 200);
    measurement.commitHeight(200, 300);
    measurement.commitHeight(100, 400);

    expect(measurement.commitHeight(200, 1_500)).toBeNull();
    expect(measurement.getSnapshot()).toMatchObject({
      committedHeight: 200,
      frozenMinHeight: null,
      oscillationPair: null,
      oscillationCount: 0,
      oscillationWindowStartedAt: 0,
    });
  });

  it("clears stale frozen state after later legitimate growth", () => {
    const measurement = createStableVirtualRowMeasurementState();

    measurement.commitHeight(100, 0);
    measurement.commitHeight(200, 100);
    measurement.commitHeight(100, 200);
    measurement.commitHeight(200, 300);
    measurement.commitHeight(100, 400);

    expect(measurement.commitHeight(260, 1_500)).toBe(260);
    expect(measurement.getSnapshot()).toMatchObject({
      committedHeight: 260,
      frozenMinHeight: null,
      oscillationPair: null,
      oscillationCount: 0,
      oscillationWindowStartedAt: 0,
    });
  });
});
