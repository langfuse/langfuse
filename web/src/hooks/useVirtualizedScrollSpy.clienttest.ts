import { act, renderHook } from "@testing-library/react";
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
      viewportRatio: 0.2,
    }),
  );

  return { ...hook, scrollElement };
}

describe("useVirtualizedScrollSpy", () => {
  it("moves the active item through the viewport-relative anchor phases", () => {
    expect(renderScrollSpy(0).result.current.activeItemId).toBe("0");
    expect(renderScrollSpy(100).result.current.activeItemId).toBe("2");
    expect(renderScrollSpy(200).result.current.activeItemId).toBe("4");
    expect(renderScrollSpy(5_000).result.current.activeItemId).toBe("52");
    expect(renderScrollSpy(8_900).result.current.activeItemId).toBe("94");
    expect(renderScrollSpy(9_000).result.current.activeItemId).toBe("99");
  });

  it("keeps the active item derived from scroll position when selecting", () => {
    const { result, scrollElement } = renderScrollSpy(5_000);

    act(() => result.current.selectItem(10));

    expect(result.current.activeItemId).toBe("52");
    expect(scrollElement.scrollTo).toHaveBeenCalledWith({
      top: 1_000,
      behavior: "smooth",
    });
  });
});
