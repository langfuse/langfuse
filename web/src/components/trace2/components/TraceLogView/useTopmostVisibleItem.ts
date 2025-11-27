/**
 * Hook to track the topmost visible item in the virtualized log view.
 *
 * Uses the virtualizer's visible items to determine which observation
 * is at the top of the viewport for the sticky header display.
 */

import { useMemo } from "react";
import { type Virtualizer } from "@tanstack/react-virtual";
import { type FlatLogItem } from "./log-view-types";

export interface UseTopmostVisibleItemParams {
  /** The virtualizer instance */
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** The flattened list of items */
  items: FlatLogItem[];
}

export interface TopmostVisibleItem {
  /** The topmost visible item, or null if none */
  item: FlatLogItem | null;
  /** The index of the topmost visible item */
  index: number;
}

/**
 * Returns the topmost visible item in the virtualized list.
 *
 * Uses the virtualizer's virtual items to find the first visible row,
 * which will be displayed in the sticky header.
 *
 * @param params - The virtualizer and items
 * @returns The topmost visible item and its index
 */
export function useTopmostVisibleItem({
  virtualizer,
  items,
}: UseTopmostVisibleItemParams): TopmostVisibleItem {
  // Get the first visible virtual item
  const virtualItems = virtualizer.getVirtualItems();

  const result = useMemo(() => {
    if (virtualItems.length === 0 || items.length === 0) {
      return { item: null, index: -1 };
    }

    // The first virtual item is the topmost visible one
    const firstVirtualItem = virtualItems[0];
    if (!firstVirtualItem) {
      return { item: null, index: -1 };
    }

    const index = firstVirtualItem.index;
    const item = items[index] ?? null;

    return { item, index };
  }, [virtualItems, items]);

  return result;
}
