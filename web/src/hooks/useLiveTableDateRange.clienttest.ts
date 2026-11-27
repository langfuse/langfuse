import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { useLiveTableDateRange } from "./useLiveTableDateRange";

const START = new Date("2026-08-11T12:00:00.000Z");

describe("useLiveTableDateRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps one window (and therefore one query key) across refreshes of a relative range", () => {
    const { result, rerender } = renderHook(
      () => useLiveTableDateRange({ range: "last1Day" }).range,
    );

    const initial = result.current;
    expect(initial?.from).toEqual(new Date("2026-08-10T12:00:00.000Z"));
    // Open-ended at the top: rows arriving after the anchor still match, so the
    // window never has to be re-resolved to pick them up.
    expect(initial?.to).toBeUndefined();

    // Two auto-refresh ticks later the window is byte-identical.
    vi.setSystemTime(new Date(START.getTime() + 30_000));
    rerender();
    vi.setSystemTime(new Date(START.getTime() + 60_000));
    rerender();

    expect(result.current).toBe(initial);
  });

  it("re-anchors once the window has drifted past its budget", () => {
    const { result, rerender } = renderHook(
      () => useLiveTableDateRange({ range: "last1Day" }).range,
    );
    const initial = result.current;

    // 10% of 24h = 2.4h budget: still the same window just before it.
    vi.setSystemTime(new Date(START.getTime() + 2 * 60 * 60 * 1000));
    rerender();
    expect(result.current).toBe(initial);

    vi.setSystemTime(new Date(START.getTime() + 3 * 60 * 60 * 1000));
    rerender();
    expect(result.current?.from).toEqual(new Date("2026-08-10T15:00:00.000Z"));
  });

  it("exposes the anchor as a closed upper bound for consumers that need one", () => {
    const { result, rerender } = renderHook(
      ({ range }: { range: string }) => useLiveTableDateRange({ range }),
      { initialProps: { range: "last1Day" } },
    );

    // Charts pair `anchoredTo` with `range.from`, so the pair is always exactly
    // the selected length — it can neither grow nor invert.
    expect(result.current.anchoredTo).toEqual(START);
    expect(
      result.current.anchoredTo!.getTime() -
        result.current.range!.from.getTime(),
    ).toBe(24 * 60 * 60 * 1000);

    vi.setSystemTime(new Date(START.getTime() + 10 * 60 * 1000));
    rerender({ range: "last1Hour" });
    expect(
      result.current.anchoredTo!.getTime() -
        result.current.range!.from.getTime(),
    ).toBe(60 * 60 * 1000);
  });

  it("passes an absolute range through unchanged and never drifts it", () => {
    const absolute = {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-02T00:00:00.000Z"),
    };
    const { result, rerender } = renderHook(
      () => useLiveTableDateRange(absolute).range,
    );

    expect(result.current).toEqual(absolute);
    const initial = result.current;

    vi.setSystemTime(new Date(START.getTime() + 30 * 24 * 60 * 60 * 1000));
    rerender();
    expect(result.current).toBe(initial);
  });

  it("re-anchors when the user picks another range, including an equal-by-value one", () => {
    const { result, rerender } = renderHook(
      ({ range }: { range: string }) => useLiveTableDateRange({ range }).range,
      { initialProps: { range: "last1Day" } },
    );
    const initial = result.current;

    // A fresh object for the same preset must not re-anchor (it would churn the
    // query key on every parent render).
    rerender({ range: "last1Day" });
    expect(result.current).toBe(initial);

    rerender({ range: "last1Hour" });
    expect(result.current?.from).toEqual(new Date("2026-08-11T11:00:00.000Z"));
  });
});
