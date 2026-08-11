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
      ({ busy }: { busy: boolean }) => useAnimatedBusy(busy, 1000),
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
});
