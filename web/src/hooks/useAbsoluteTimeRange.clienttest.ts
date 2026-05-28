import { act, renderHook } from "@testing-library/react";
import { useAbsoluteTimeRange } from "@/src/hooks/useAbsoluteTimeRange";
import { type TimeRange } from "@/src/utils/date-range-utils";

describe("useAbsoluteTimeRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves a relative preset and rolls the window forward on focus", () => {
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));
    const timeRange: TimeRange = { range: "last6Hours" };

    const { result } = renderHook(() => useAbsoluteTimeRange(timeRange));

    expect(result.current?.from.toISOString()).toBe(
      "2026-05-18T06:00:00.000Z",
    );
    expect(result.current?.to.toISOString()).toBe("2026-05-18T12:00:00.000Z");

    // Time passes while the tab is backgrounded, then the user returns to it.
    act(() => {
      vi.setSystemTime(new Date("2026-05-18T15:00:00.000Z"));
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current?.from.toISOString()).toBe(
      "2026-05-18T09:00:00.000Z",
    );
    expect(result.current?.to.toISOString()).toBe("2026-05-18T15:00:00.000Z");
  });

  it("keeps an absolute range stable across focus events", () => {
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));
    const timeRange: TimeRange = {
      from: new Date("2026-05-01T00:00:00.000Z"),
      to: new Date("2026-05-02T00:00:00.000Z"),
    };

    const { result } = renderHook(() => useAbsoluteTimeRange(timeRange));
    const first = result.current;

    act(() => {
      vi.setSystemTime(new Date("2026-05-18T15:00:00.000Z"));
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current).toBe(first);
    expect(result.current?.from.toISOString()).toBe(
      "2026-05-01T00:00:00.000Z",
    );
    expect(result.current?.to.toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });

  it("rolls the window forward when refreshSignal advances", () => {
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));
    const timeRange: TimeRange = { range: "last1Hour" };

    const { result, rerender } = renderHook(
      ({ signal }) => useAbsoluteTimeRange(timeRange, signal),
      { initialProps: { signal: 0 } },
    );

    expect(result.current?.to.toISOString()).toBe("2026-05-18T12:00:00.000Z");

    act(() => {
      vi.setSystemTime(new Date("2026-05-18T12:30:00.000Z"));
    });
    rerender({ signal: 1 });

    expect(result.current?.to.toISOString()).toBe("2026-05-18T12:30:00.000Z");
  });
});
