import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { useAnimatedBusy } from "./useAnimatedBusy";

describe("useAnimatedBusy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds a fast finish for a whole cycle, and a slow one to its next cycle", () => {
    const { result, rerender } = renderHook(
      ({ busy }: { busy: boolean }) => useAnimatedBusy(busy, 1000).active,
      { initialProps: { busy: false } },
    );

    // 200ms of work still spins for the full 1000ms turn.
    rerender({ busy: true });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ busy: false });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);

    // 1200ms of work rounds up to two turns rather than stopping mid-rotation.
    rerender({ busy: true });
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    rerender({ busy: false });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current).toBe(false);
  });

  it("stays on across the gap between a refresh's stages", () => {
    const { result, rerender } = renderHook(
      ({ busy }: { busy: boolean }) => useAnimatedBusy(busy, 1000, 400).active,
      { initialProps: { busy: false } },
    );

    // Rows land, then their batched I/O starts a moment later: one refresh, so
    // the flag must not drop in between (it would restart the animation).
    rerender({ busy: true });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ busy: false });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);

    rerender({ busy: true });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender({ busy: false });
    expect(result.current).toBe(true);

    // Released a settle window later, rounded up to a whole cycle (900 + 400
    // settle -> two cycles from the original start).
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current).toBe(false);
  });

  it("counts one epoch per busy period, so the animation restarts only between refreshes", () => {
    const { result, rerender } = renderHook(
      ({ busy }: { busy: boolean }) => useAnimatedBusy(busy, 1000, 400),
      { initialProps: { busy: false } },
    );
    expect(result.current.epoch).toBe(0);

    // One refresh, two stages: same epoch throughout.
    rerender({ busy: true });
    const first = result.current.epoch;
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ busy: false });
    rerender({ busy: true });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.epoch).toBe(first);

    rerender({ busy: false });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.active).toBe(false);

    rerender({ busy: true });
    expect(result.current.epoch).toBe(first + 1);
  });
});
