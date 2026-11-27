import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import {
  isLiveTailTimeSort,
  usePaginationWindowPin,
} from "./usePaginationWindowPin";

const START = new Date("2026-08-12T12:00:00.000Z");
const LIVE = { from: new Date("2026-08-11T12:00:00.000Z"), to: undefined };
const NEWEST_ON_PAGE_1 = new Date("2026-08-12T11:59:58.000Z");
const OLDEST_ON_PAGE_1 = new Date("2026-08-11T12:05:00.000Z");

describe("isLiveTailTimeSort", () => {
  it("is true for the default time-DESC sort and false for ASC or other columns", () => {
    expect(isLiveTailTimeSort(null, "timestamp")).toBe(true);
    expect(
      isLiveTailTimeSort({ column: "timestamp", order: "DESC" }, "timestamp"),
    ).toBe(true);
    expect(
      isLiveTailTimeSort({ column: "startTime", order: "DESC" }, "startTime"),
    ).toBe(true);
    expect(
      isLiveTailTimeSort({ column: "timestamp", order: "ASC" }, "timestamp"),
    ).toBe(false);
    expect(
      isLiveTailTimeSort({ column: "startTime", order: "ASC" }, "startTime"),
    ).toBe(false);
    expect(
      isLiveTailTimeSort({ column: "name", order: "DESC" }, "timestamp"),
    ).toBe(false);
  });
});

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

  it("keeps both bounds from the page-1 snapshot when later pages re-pin", () => {
    const { result, rerender } = renderHook(
      ({ pageIndex, range, resetKey }) =>
        usePaginationWindowPin(range, pageIndex, { resetKey }),
      { initialProps: { pageIndex: 0, range: LIVE, resetKey: "page-50" } },
    );

    act(() => result.current.pinOnLeavingFirstPage(1, NEWEST_ON_PAGE_1));
    rerender({ pageIndex: 1, range: LIVE, resetKey: "page-50" });

    // Page 2's newest row is older. Re-pinning to it would retreat the window
    // and shrink the count on a timestamp-DESC sort.
    const olderTop = new Date("2026-08-12T11:00:00.000Z");
    act(() => result.current.pinOnLeavingFirstPage(2, olderTop));
    rerender({ pageIndex: 2, range: LIVE, resetKey: "page-50" });
    expect(result.current.range).toEqual({
      from: LIVE.from,
      to: NEWEST_ON_PAGE_1,
    });

    // A relative lower bound that slides forward must not shrink the snapshot.
    const slid = {
      from: new Date("2026-08-11T18:00:00.000Z"),
      to: undefined,
    };
    rerender({ pageIndex: 3, range: slid, resetKey: "page-50" });
    act(() => result.current.pinOnLeavingFirstPage(3, olderTop));
    expect(result.current.range).toEqual({
      from: LIVE.from,
      to: NEWEST_ON_PAGE_1,
    });

    // Sort, page size, and the selected time range replace the snapshot.
    // Leaving it open while the reader is still past page 1 would let the
    // next click follow the live tail and move the total again.
    rerender({ pageIndex: 3, range: slid, resetKey: "page-100" });
    expect(result.current.range).toEqual({ from: slid.from, to: START });
    act(() => result.current.pinOnLeavingFirstPage(4, olderTop));
    expect(result.current.range).toEqual({ from: slid.from, to: START });
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

  it("replaces the previous view's pin before the page reset reaches the URL", () => {
    const { result, rerender } = renderHook(
      ({ pageIndex }) => usePaginationWindowPin(LIVE, pageIndex),
      { initialProps: { pageIndex: 2 } },
    );
    expect(result.current.range?.to).toEqual(START);

    // The URL page index lands a render later. Until then the reader is still
    // past page 1, so the old window is replaced by a fresh one rather than
    // left open.
    const later = new Date(START.getTime() + 5_000);
    vi.setSystemTime(later);
    act(() => result.current.resetPin());
    expect(result.current.range).toEqual({ from: LIVE.from, to: later });

    rerender({ pageIndex: 0 });
    expect(result.current.range?.to).toBeUndefined();
    act(() => result.current.pinOnLeavingFirstPage(1, NEWEST_ON_PAGE_1));
    rerender({ pageIndex: 1 });
    expect(result.current.range?.to).toEqual(NEWEST_ON_PAGE_1);
  });

  it("does not pin a live window when the sort has no live tail", () => {
    const { result, rerender } = renderHook(
      ({ pageIndex }: { pageIndex: number }) =>
        usePaginationWindowPin(LIVE, pageIndex, { enabled: false }),
      { initialProps: { pageIndex: 0 } },
    );

    act(() => result.current.pinOnLeavingFirstPage(1, OLDEST_ON_PAGE_1));
    rerender({ pageIndex: 1 });

    expect(result.current.range?.to).toBeUndefined();
    expect(result.current.range).toBe(LIVE);
  });

  it("releases an existing pin when the sort stops being a live tail", () => {
    const { result, rerender } = renderHook(
      ({ pageIndex, enabled }: { pageIndex: number; enabled: boolean }) =>
        usePaginationWindowPin(LIVE, pageIndex, { enabled }),
      { initialProps: { pageIndex: 0, enabled: true } },
    );

    act(() => result.current.pinOnLeavingFirstPage(1, NEWEST_ON_PAGE_1));
    rerender({ pageIndex: 1, enabled: true });
    expect(result.current.range?.to).toEqual(NEWEST_ON_PAGE_1);

    rerender({ pageIndex: 1, enabled: false });
    expect(result.current.range?.to).toBeUndefined();
  });

  it("pins to now when a live-tail sort is turned on past page 1", () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        usePaginationWindowPin(LIVE, 1, { enabled }),
      { initialProps: { enabled: false } },
    );

    expect(result.current.range?.to).toBeUndefined();

    const later = new Date(START.getTime() + 40_000);
    vi.setSystemTime(later);
    rerender({ enabled: true });
    expect(result.current.range?.to).toEqual(later);
  });

  it("does not reuse a stale pin when the live tail is turned back on", () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        usePaginationWindowPin(LIVE, 1, { enabled }),
      { initialProps: { enabled: true } },
    );

    // Opening page 2 directly already pinned to now. A later pagination
    // callback must not replace that with the page's own newest row.
    act(() => result.current.pinOnLeavingFirstPage(1, NEWEST_ON_PAGE_1));
    expect(result.current.range?.to).toEqual(START);

    rerender({ enabled: false });
    expect(result.current.range?.to).toBeUndefined();

    const later = new Date(START.getTime() + 40_000);
    vi.setSystemTime(later);
    rerender({ enabled: true });
    expect(result.current.range?.to).toEqual(later);
  });
});
