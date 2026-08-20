import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { usePaginationWindowPin } from "./usePaginationWindowPin";

const START = new Date("2026-08-12T12:00:00.000Z");
const LIVE = { from: new Date("2026-08-11T12:00:00.000Z"), to: undefined };
const NEWEST_ON_PAGE_1 = new Date("2026-08-12T11:59:58.000Z");

describe("usePaginationWindowPin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pins to the row page 1 ended on, holds it while paging, and goes live on return", () => {
    const { result, rerender } = renderHook(
      ({ pageIndex }: { pageIndex: number }) =>
        usePaginationWindowPin(LIVE, pageIndex),
      { initialProps: { pageIndex: 0 } },
    );

    // Page 1 is the live tail: no upper bound, so new rows keep arriving.
    expect(result.current.range?.to).toBeUndefined();

    // Rows keep arriving while the reader sits on page 1; leaving it must pin to
    // what was on screen, NOT to now, or page 2 re-includes the new arrivals.
    vi.setSystemTime(new Date(START.getTime() + 40_000));
    act(() => result.current.pinOnLeavingFirstPage(1, NEWEST_ON_PAGE_1));
    rerender({ pageIndex: 1 });
    expect(result.current.range?.to).toEqual(NEWEST_ON_PAGE_1);

    // Paging further keeps that same set: offsets stay meaningful.
    const pinned = result.current.range;
    rerender({ pageIndex: 2 });
    expect(result.current.range).toBe(pinned);

    rerender({ pageIndex: 0 });
    expect(result.current.range?.to).toBeUndefined();

    // Going back out again re-pins to that page's newest row, not the stale one.
    const newerTop = new Date(START.getTime() + 60_000);
    act(() => result.current.pinOnLeavingFirstPage(1, newerTop));
    rerender({ pageIndex: 1 });
    expect(result.current.range?.to).toEqual(newerTop);
  });

  it("pins to now when a later page is opened directly, and leaves closed ranges alone", () => {
    const { result } = renderHook(() => usePaginationWindowPin(LIVE, 2));
    expect(result.current.range?.to).toEqual(START);

    const absolute = {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-02T00:00:00.000Z"),
    };
    const closed = renderHook(() => usePaginationWindowPin(absolute, 2));
    expect(closed.result.current.range).toBe(absolute);
  });
});
