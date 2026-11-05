import { describe, expect, it } from "vitest";
import { measureElement, type Virtualizer } from "@tanstack/react-virtual";

function createMeasureInstance(cachedSize?: number) {
  const itemSizeCache = new Map<string | number, number>();
  if (cachedSize !== undefined) {
    itemSizeCache.set("row", cachedSize);
  }

  return {
    options: {
      getItemKey: () => "row",
      horizontal: false,
      useCachedMeasurements: false,
    },
    itemSizeCache,
    indexFromElement: () => 0,
  } as unknown as Virtualizer<Element, Element>;
}

describe("tanstack default measureElement", () => {
  it("returns the cached size when the callback ref attaches without a ResizeObserver entry", () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "offsetHeight", { value: 99 });
    Object.defineProperty(element, "getBoundingClientRect", {
      value: () => ({ height: 64.4 }),
    });

    expect(measureElement(element, undefined, createMeasureInstance(40))).toBe(
      40,
    );
  });
});
