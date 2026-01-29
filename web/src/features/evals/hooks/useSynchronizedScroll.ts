import { useEffect, type RefObject } from "react";

/**
 * Synchronizes vertical scrolling between two scrollable elements.
 * When either element scrolls, the other element's scroll position is updated to match.
 *
 * @param leftRef - Ref to the left scrollable element
 * @param rightRef - Ref to the right scrollable element
 * @param deps - Optional dependencies array for when to re-attach scroll listeners
 *
 * @example
 * ```tsx
 * const leftScrollRef = useRef<HTMLDivElement>(null);
 * const rightScrollRef = useRef<HTMLDivElement>(null);
 * useSynchronizedScroll(leftScrollRef, rightScrollRef);
 * ```
 */
export function useSynchronizedScroll<
  TLeft extends HTMLElement = HTMLElement,
  TRight extends HTMLElement = HTMLElement,
>(
  leftRef: RefObject<TLeft>,
  rightRef: RefObject<TRight>,
  deps: unknown[] = [],
) {
  useEffect(() => {
    const leftDiv = leftRef.current;
    const rightDiv = rightRef.current;

    if (!leftDiv || !rightDiv) return;

    const handleLeftScroll = () => {
      if (rightDiv) {
        rightDiv.scrollTop = leftDiv.scrollTop;
      }
    };

    const handleRightScroll = () => {
      if (leftDiv) {
        leftDiv.scrollTop = rightDiv.scrollTop;
      }
    };

    leftDiv.addEventListener("scroll", handleLeftScroll);
    rightDiv.addEventListener("scroll", handleRightScroll);

    return () => {
      leftDiv.removeEventListener("scroll", handleLeftScroll);
      rightDiv.removeEventListener("scroll", handleRightScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
