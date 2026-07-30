import { act, fireEvent, renderHook } from "@testing-library/react";
import { type Virtualizer } from "@tanstack/react-virtual";
import { describe, expect, it, vi } from "vitest";

import { useVirtualizedScrollSpy } from "@/src/hooks/useVirtualizedScrollSpy";

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

function renderScrollSpy(scrollOffset: number) {
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
  it("tracks the item at the sticky top edge until the end transition", () => {
    expect(renderScrollSpy(0).result.current.activeItemId).toBe("0");
    expect(renderScrollSpy(100).result.current.activeItemId).toBe("1");
    expect(renderScrollSpy(200).result.current.activeItemId).toBe("2");
    expect(renderScrollSpy(5_000).result.current.activeItemId).toBe("50");
    expect(renderScrollSpy(8_900).result.current.activeItemId).toBe("93");
    expect(renderScrollSpy(9_000).result.current.activeItemId).toBe("99");
  });

  it("scrolls to an offset where the selected item is active", () => {
    const { result, scrollElement } = renderScrollSpy(5_000);

    act(() => result.current.selectItem(95));

    expect(result.current.activeItemId).toBe("50");
    const scrollOptions = vi.mocked(scrollElement.scrollTo).mock.calls[0]?.[0];
    expect(scrollOptions).toEqual({
      top: expect.any(Number),
      behavior: "smooth",
    });
    if (!scrollOptions || typeof scrollOptions !== "object") {
      throw new Error("Expected scroll options");
    }
    expect(
      renderScrollSpy(scrollOptions.top ?? 0).result.current.activeItemId,
    ).toBe("95");
  });

  it("scrolls the final item to the bottom of the viewport", () => {
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
