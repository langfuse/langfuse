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

    act(() => result.current.pinOnLeavingFirstPage(1, NEWEST_ON_PAGE_1));
    expect(result.current.range?.to).toEqual(NEWEST_ON_PAGE_1);

    rerender({ enabled: false });
    expect(result.current.range?.to).toBeUndefined();

    const later = new Date(START.getTime() + 40_000);
    vi.setSystemTime(later);
    rerender({ enabled: true });
    expect(result.current.range?.to).toEqual(later);
  });
});
