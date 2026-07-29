import { useCallback, useState, type RefObject } from "react";
import { type Virtualizer } from "@tanstack/react-virtual";

/**
 * Returns the point in the virtualized content that determines the active item.
 *
 * The anchor moves through three phases as the user scrolls:
 *
 * 1. At the beginning, it starts at the viewport's top edge and moves down to
 *    `viewportRatio` of the visible viewport. For example, a ratio of `0.2`
 *    moves the anchor from 0px to 200px during the first 200px of scrolling in
 *    a 1,000px-high viewport.
 * 2. Through the middle, it remains at that viewport-relative position. This
 *    makes an item active shortly after it enters the viewport instead of only
 *    when it reaches the very top.
 * 3. Near the end, it moves from its resting position to the viewport's bottom
 *    edge. This allows the final items to become active without adding empty
 *    padding after the content.
 *
 * The return value is an absolute content coordinate, not an offset within the
 * viewport. It can therefore be compared directly with TanStack Virtual's
 * `VirtualItem.start` and `VirtualItem.end` values.
 */
function getScrollSpyAnchor({
  scrollOffset,
  viewportHeight,
  totalSize,
  viewportRatio,
}: {
  scrollOffset: number;
  viewportHeight: number;
  totalSize: number;
  viewportRatio: number;
}) {
  const maxScrollOffset = Math.max(0, totalSize - viewportHeight);
  if (viewportHeight <= 0 || maxScrollOffset === 0) return scrollOffset;

  const clampedScrollOffset = Math.max(
    0,
    Math.min(scrollOffset, maxScrollOffset),
  );
  const viewportBottomOffset = Math.max(0, viewportHeight - 1);
  const clampedViewportRatio = Math.max(0, Math.min(viewportRatio, 1));
  const restingOffset = Math.min(
    viewportHeight * clampedViewportRatio,
    viewportBottomOffset,
  );

  // Normally, the transition distance equals the resting offset. When the
  // entire scroll range is shorter than both edge transitions, each transition
  // receives half of the available range so they meet but never overlap.
  const transitionDistance = Math.min(restingOffset, maxScrollOffset / 2);
  if (transitionDistance === 0) return clampedScrollOffset;

  if (clampedScrollOffset < transitionDistance) {
    const anchorOffset =
      restingOffset * (clampedScrollOffset / transitionDistance);
    return clampedScrollOffset + anchorOffset;
  }

  const distanceToBottom = maxScrollOffset - clampedScrollOffset;
  if (distanceToBottom >= transitionDistance) {
    return clampedScrollOffset + restingOffset;
  }

  const endProgress = 1 - distanceToBottom / transitionDistance;
  // Stop one pixel before the viewport boundary. The item range comparison is
  // end-exclusive, so using viewportHeight exactly could produce totalSize and
  // leave no item containing the anchor at the natural scroll bottom.
  const anchorOffset =
    restingOffset + (viewportBottomOffset - restingOffset) * endProgress;
  return clampedScrollOffset + anchorOffset;
}

/**
 * Coordinates scroll-spy state for a TanStack Virtual list.
 *
 * Automatic mode derives the active item from the virtual item containing a
 * viewport-relative anchor. Selecting an item temporarily overrides that
 * derived value and smoothly scrolls the item to the top. Call
 * `restoreScrollSpy` when the user manually interacts with the scroll area so
 * automatic active-item tracking resumes.
 *
 * The hook also returns the current `virtualItems` so the consumer renders the
 * same virtualizer snapshot used to derive `activeItemId`.
 *
 * `viewportRatio` controls both the anchor's resting position and the length
 * of the start/end transitions, relative to the visible scroll element rather
 * than the full content height. Values outside 0 through 1 are clamped.
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
  viewportRatio,
}: {
  items: TItem[];
  virtualizer: Virtualizer<TScrollElement, TItemElement>;
  scrollElementRef: RefObject<TScrollElement | null>;
  viewportHeight: number;
  viewportRatio: number;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const virtualItems = virtualizer.getVirtualItems();
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const scrollSpyAnchor = getScrollSpyAnchor({
    scrollOffset,
    viewportHeight,
    totalSize: virtualizer.getTotalSize(),
    viewportRatio,
  });
  const activeVirtualItem =
    virtualItems.find(
      (item) => item.start <= scrollSpyAnchor && item.end > scrollSpyAnchor,
    ) ?? virtualItems.find((item) => item.start > scrollSpyAnchor);
  const scrollSpyItemId =
    items[activeVirtualItem?.index ?? 0]?.id ?? items[0]?.id;

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      const scrollElement = scrollElementRef.current;
      const offset = virtualizer.getOffsetForIndex(index, "start")?.[0];
      if (!item || !scrollElement || offset === undefined) return;

      setSelectedItemId(item.id);
      // Native scrolling avoids TanStack's smooth-scroll retries against
      // dynamically measured rows stopping one row before the target.
      scrollElement.scrollTo({ top: offset, behavior: "smooth" });
    },
    [items, scrollElementRef, virtualizer],
  );

  const restoreScrollSpy = useCallback(() => setSelectedItemId(undefined), []);

  return {
    activeItemId: selectedItemId ?? scrollSpyItemId,
    virtualItems,
    selectItem,
    restoreScrollSpy,
  };
}
