import { useCallback, useEffect, useState, type RefObject } from "react";
import { type Virtualizer } from "@tanstack/react-virtual";

/**
 * Returns the point in the virtualized content that determines the active item.
 *
 * The anchor moves through two phases as the user scrolls:
 *
 * 1. Through the normal scroll range, it stays at the viewport's top edge so
 *    the active item matches a sticky item header.
 * 2. Near the end, it moves from the top to the viewport's bottom edge. This
 *    allows the final items to become active without adding empty padding after
 *    the content.
 *
 * The return value is an absolute content coordinate, not an offset within the
 * viewport. It can therefore be compared directly with TanStack Virtual's
 * `VirtualItem.start` and `VirtualItem.end` values.
 */
function getScrollSpyAnchor({
  scrollOffset,
  viewportHeight,
  totalSize,
  endTransitionRatio,
}: {
  scrollOffset: number;
  viewportHeight: number;
  totalSize: number;
  endTransitionRatio: number;
}) {
  const maxScrollOffset = Math.max(0, totalSize - viewportHeight);
  if (viewportHeight <= 0 || maxScrollOffset === 0) return scrollOffset;

  const clampedScrollOffset = Math.max(
    0,
    Math.min(scrollOffset, maxScrollOffset),
  );
  const viewportBottomOffset = Math.max(0, viewportHeight - 1);
  const clampedEndTransitionRatio = Math.max(
    0,
    Math.min(endTransitionRatio, 1),
  );
  const transitionDistance = Math.min(
    viewportHeight * clampedEndTransitionRatio,
    maxScrollOffset,
  );
  if (transitionDistance === 0) return clampedScrollOffset;

  const distanceToBottom = maxScrollOffset - clampedScrollOffset;
  if (distanceToBottom >= transitionDistance) {
    return clampedScrollOffset;
  }

  const endProgress = 1 - distanceToBottom / transitionDistance;
  // Stop one pixel before the viewport boundary. The item range comparison is
  // end-exclusive, so using viewportHeight exactly could produce totalSize and
  // leave no item containing the anchor at the natural scroll bottom.
  const anchorOffset = viewportBottomOffset * endProgress;
  return clampedScrollOffset + anchorOffset;
}

/**
 * Coordinates scroll-spy state for a TanStack Virtual list.
 *
 * The active item is derived from the virtual item containing a
 * viewport-relative anchor. Selecting an item smoothly scrolls to its start.
 *
 * If the list is too short to scroll to the selected item, selection remains
 * active until the user scrolls beyond a small viewport-relative buffer.
 *
 * The hook also returns the current `virtualItems` so the consumer renders the
 * same virtualizer snapshot used to derive `activeItemId`.
 *
 * `endTransitionRatio` controls how much of the final scroll range moves the
 * anchor from the viewport top to bottom. Values outside 0 through 1 are
 * clamped.
 */
export function useVirtualizedScrollSpy<
  TItem extends { id: string },
  TScrollElement extends HTMLElement,
  TItemElement extends Element,
>({
  items,
  virtualizer,
  scrollElementRef,
  viewportHeight,
  endTransitionRatio,
}: {
  items: TItem[];
  virtualizer: Virtualizer<TScrollElement, TItemElement>;
  scrollElementRef: RefObject<TScrollElement | null>;
  viewportHeight: number;
  endTransitionRatio: number;
}) {
  const [selectedFallback, setSelectedFallback] = useState<{
    itemId: string;
    scrollOffset: number;
  } | null>(null);
  const virtualItems = virtualizer.getVirtualItems();
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const fallbackBuffer = Math.min(96, viewportHeight * 0.1);
  const scrollSpyAnchor = getScrollSpyAnchor({
    scrollOffset,
    viewportHeight,
    totalSize: virtualizer.getTotalSize(),
    endTransitionRatio,
  });
  const activeVirtualItem =
    virtualItems.find(
      (item) => item.start <= scrollSpyAnchor && item.end > scrollSpyAnchor,
    ) ?? virtualItems.find((item) => item.start > scrollSpyAnchor);
  const scrollSpyItemId =
    items[activeVirtualItem?.index ?? 0]?.id ?? items[0]?.id;

  useEffect(() => {
    const scrollElement = scrollElementRef.current;
    if (!selectedFallback || !scrollElement) return;

    const clearFallbackOutsideBuffer = () => {
      if (
        Math.abs(scrollElement.scrollTop - selectedFallback.scrollOffset) <=
        fallbackBuffer
      ) {
        return;
      }

      setSelectedFallback((currentFallback) =>
        currentFallback === selectedFallback ? null : currentFallback,
      );
    };

    scrollElement.addEventListener("scroll", clearFallbackOutsideBuffer, {
      passive: true,
    });
    return () =>
      scrollElement.removeEventListener("scroll", clearFallbackOutsideBuffer);
  }, [fallbackBuffer, scrollElementRef, selectedFallback]);

  const selectItem = useCallback(
    (index: number) => {
      const scrollElement = scrollElementRef.current;
      const item = items[index];
      const offset = virtualizer.getOffsetForIndex(index, "start")?.[0];
      if (!item || !scrollElement || offset === undefined) return;

      const totalSize = virtualizer.getTotalSize();
      const scrollTarget = Math.min(
        offset,
        Math.max(0, totalSize - viewportHeight),
      );
      const targetAnchor = getScrollSpyAnchor({
        scrollOffset: scrollTarget,
        viewportHeight,
        totalSize,
        endTransitionRatio,
      });
      const nextItemOffset =
        virtualizer.getOffsetForIndex(index + 1, "start")?.[0] ?? totalSize;
      const selectionIsRepresented =
        offset <= targetAnchor && targetAnchor < nextItemOffset;

      setSelectedFallback(
        selectionIsRepresented
          ? null
          : { itemId: item.id, scrollOffset: scrollTarget },
      );

      // Native scrolling avoids TanStack's smooth-scroll retries against
      // dynamically measured rows stopping one row before the target.
      scrollElement.scrollTo({ top: scrollTarget, behavior: "smooth" });
    },
    [endTransitionRatio, items, scrollElementRef, viewportHeight, virtualizer],
  );

  return {
    activeItemId: selectedFallback?.itemId ?? scrollSpyItemId,
    virtualItems,
    selectItem,
  };
}
