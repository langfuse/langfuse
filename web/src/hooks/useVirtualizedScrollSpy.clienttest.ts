import { act, fireEvent, renderHook } from "@testing-library/react";
import { type Virtualizer } from "@tanstack/react-virtual";
import { describe, expect, it, vi } from "vitest";

import {
  getScrollOffsetForScrollSpyAnchor,
  getScrollSpyAnchor,
  useVirtualizedScrollSpy,
} from "@/src/hooks/useVirtualizedScrollSpy";

const items = Array.from({ length: 100 }, (_, index) => ({
  id: String(index),
}));
const virtualItems = items.map((_, index) => ({
  index,
  key: String(index),
  start: index * 100,
  end: (index + 1) * 100,
  size: 100,
  lane: 0,
}));

function renderScrollSpy(scrollOffset: number, viewportInset = 0) {
  const scrollElement = document.createElement("div");
  scrollElement.scrollTo = vi.fn();
  const virtualizer = {
    scrollOffset,
    getTotalSize: () => 10_000,
    getVirtualItems: () => virtualItems,
    getOffsetForIndex: (index: number) => [index * 100],
  } as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>;

  const hook = renderHook(() =>
    useVirtualizedScrollSpy({
      items,
      virtualizer,
      scrollElementRef: { current: scrollElement },
      viewportHeight: 1_000,
      endTransitionRatio: 0.2,
      viewportInset,
    }),
  );

  return { ...hook, scrollElement };
}

function renderFittingScrollSpy() {
  const fittingItems = items.slice(0, 5);
  const fittingVirtualItems = virtualItems.slice(0, 5);
  const scrollElement = document.createElement("div");
  scrollElement.scrollTo = vi.fn();
  const virtualizer = {
    scrollOffset: 0,
    getTotalSize: () => 500,
    getVirtualItems: () => fittingVirtualItems,
    getOffsetForIndex: (index: number) => [index * 100],
  } as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>;

  const hook = renderHook(() =>
    useVirtualizedScrollSpy({
      items: fittingItems,
      virtualizer,
      scrollElementRef: { current: scrollElement },
      viewportHeight: 1_000,
      endTransitionRatio: 0.2,
    }),
  );

  return { ...hook, scrollElement };
}

describe("useVirtualizedScrollSpy", () => {
  it("crosses item boundaries at the inset during manual scrolling in both directions", () => {
    for (const offset of [99, 100, 101, 100, 99]) {
      expect(renderScrollSpy(offset, 200).result.current.activeItemId).toBe(
        offset < 100 ? "2" : "3",
      );
    }
    expect(renderScrollSpy(9_000, 200).result.current.activeItemId).toBe("99");
  });

  it("clamps the inset and scroll target in a fitting viewport", () => {
    const geometry = {
      viewportHeight: 8,
      totalSize: 4,
      endTransitionRatio: 0.2,
      viewportInset: 8 * 0.2,
    };
    expect(getScrollSpyAnchor({ scrollOffset: 0, ...geometry })).toBe(1.6);
    expect(getScrollOffsetForScrollSpyAnchor({ anchor: 0, ...geometry })).toBe(
      0,
    );
  });

  it.each([300, 500, 800])(
    "round-trips inset anchors at %spx across the end transition",
    (viewportHeight) => {
      const geometry = {
        viewportHeight,
        totalSize: 10_000,
        endTransitionRatio: 0.2,
        viewportInset: viewportHeight * 0.2,
      };
      for (const anchor of [viewportHeight * 0.2, 350, 9_416, 9_700, 9_999]) {
        const scrollOffset = getScrollOffsetForScrollSpyAnchor({
          anchor,
          ...geometry,
        });
        expect(getScrollSpyAnchor({ scrollOffset, ...geometry })).toBeCloseTo(
          anchor,
        );
      }
    },
  );

  it.each([0, 100, 8_800, 8_900, 9_000, 9_999])(
    "aligns content coordinate %s with the manual scroll-spy anchor",
    (anchor) => {
      const geometry = {
        viewportHeight: 1_000,
        totalSize: 10_000,
        endTransitionRatio: 0.2,
      };
      const scrollOffset = getScrollOffsetForScrollSpyAnchor({
        anchor,
        ...geometry,
      });
      expect(getScrollSpyAnchor({ scrollOffset, ...geometry })).toBeCloseTo(
        anchor,
      );
    },
  );

  it("clamps an impossible anchor in a fitting list", () => {
    expect(
      getScrollOffsetForScrollSpyAnchor({
        anchor: 400,
        viewportHeight: 1_000,
        totalSize: 500,
        endTransitionRatio: 0.2,
      }),
    ).toBe(0);
  });

  it("tracks the item at the sticky top edge until the end transition", () => {
    expect(renderScrollSpy(0).result.current.activeItemId).toBe("0");
    expect(renderScrollSpy(100).result.current.activeItemId).toBe("1");
    expect(renderScrollSpy(200).result.current.activeItemId).toBe("2");
    expect(renderScrollSpy(5_000).result.current.activeItemId).toBe("50");
    expect(renderScrollSpy(8_900).result.current.activeItemId).toBe("93");
    expect(renderScrollSpy(9_000).result.current.activeItemId).toBe("99");
  });

  it("scrolls to the selected item start", () => {
    const { result, scrollElement } = renderScrollSpy(5_000);

    act(() => result.current.selectItem(89));

    expect(result.current.activeItemId).toBe("89");
    expect(scrollElement.scrollTo).toHaveBeenCalledWith({
      top: 8_900,
      behavior: "smooth",
    });
  });

  it("clamps a selected item start to the available scroll range", () => {
    const { result, scrollElement } = renderScrollSpy(5_000);

    act(() => result.current.selectItem(99));

    expect(scrollElement.scrollTo).toHaveBeenCalledWith({
      top: 9_000,
      behavior: "smooth",
    });
    expect(renderScrollSpy(9_000).result.current.activeItemId).toBe("99");
  });

  it("keeps an unscrollable selection active within a scroll buffer", () => {
    const { result, scrollElement } = renderFittingScrollSpy();

    act(() => result.current.selectItem(4));
    expect(result.current.activeItemId).toBe("4");

    act(() => result.current.selectItem(2));
    expect(result.current.activeItemId).toBe("2");

    scrollElement.scrollTop = 95;
    fireEvent.scroll(scrollElement);
    expect(result.current.activeItemId).toBe("2");

    scrollElement.scrollTop = 97;
    fireEvent.scroll(scrollElement);
    expect(result.current.activeItemId).toBe("0");
  });
});
