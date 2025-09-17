import { useCallback, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/router";

type ScrollTarget = Window | Element;

function isWindow(target: ScrollTarget): target is Window {
  return (
    (target as Window).scrollBy !== undefined &&
    (target as Window).document !== undefined
  );
}

function getComputedOverflowY(node: Element): string {
  const style = window.getComputedStyle(node);
  return style.overflowY;
}

function isScrollable(node: Element): boolean {
  const overflowY = getComputedOverflowY(node);
  if (overflowY !== "auto" && overflowY !== "scroll") return false;
  return node.scrollHeight > node.clientHeight;
}

function findNearestScrollContainer(start: Element): ScrollTarget {
  let node: Element | null = start;
  while (node && node !== document.body) {
    if (isScrollable(node)) return node;
    node = node.parentElement;
  }
  return window;
}

export interface UsePreserveScrollOnTabSwitchOptions {
  getScrollTarget?: (clickedElement: Element) => ScrollTarget;
  enabled?: boolean;
  storageKey?: string;
}

/**
 * Preserves scroll position when switching between tabs that involve page navigation.
 * This hook stores the scroll position before navigation and restores it after the new page loads.
 *
 * @param activeTab - The current active tab value
 * @param options - Optional configuration for scroll target detection and enabling the behavior
 */
export function usePreserveScrollOnTabSwitch<T extends Element = Element>(
  activeTab: string,
  options?: UsePreserveScrollOnTabSwitchOptions,
): [React.RefObject<T | null>, (targetHref: string) => void] {
  const enabled = options?.enabled ?? true;
  const storageKey = options?.storageKey ?? "tab-scroll-position";
  const router = useRouter();
  const elementRef = useRef<T | null>(null);
  const isRestoringRef = useRef<boolean>(false);

  // Store scroll position before tab switch
  const startPreserveScroll = useCallback(
    (targetHref: string) => {
      if (!enabled) return;
      const element = elementRef.current;
      if (!element || !element.getBoundingClientRect) return;

      const rect = element.getBoundingClientRect();
      const scrollTarget =
        options?.getScrollTarget?.(element) ??
        findNearestScrollContainer(element);

      let scrollTop = 0;
      if (isWindow(scrollTarget)) {
        scrollTop = window.scrollY;
      } else {
        scrollTop = (scrollTarget as Element).scrollTop;
      }

      // Store the scroll position and element position for this tab
      const scrollData = {
        elementTop: rect.top,
        scrollTop,
        timestamp: Date.now(),
        targetHref,
      };

      try {
        sessionStorage.setItem(
          `${storageKey}-${router.asPath}`,
          JSON.stringify(scrollData),
        );
      } catch (error) {
        // Handle cases where sessionStorage is not available
        console.warn("Failed to store scroll position:", error);
      }
    },
    [enabled, options, router.asPath, storageKey],
  );

  // Restore scroll position after tab switch
  const restoreScrollPosition = useCallback(() => {
    if (!enabled || isRestoringRef.current) return;

    try {
      const storedData = sessionStorage.getItem(
        `${storageKey}-${router.asPath}`,
      );
      if (!storedData) return;

      const scrollData = JSON.parse(storedData);
      
      // Only restore if the data is recent (within 5 seconds)
      if (Date.now() - scrollData.timestamp > 5000) {
        sessionStorage.removeItem(`${storageKey}-${router.asPath}`);
        return;
      }

      const element = elementRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const scrollTarget =
        options?.getScrollTarget?.(element) ??
        findNearestScrollContainer(element);

      // Calculate the difference between stored and current element position
      const elementTopDelta = rect.top - scrollData.elementTop;
      const targetScrollTop = scrollData.scrollTop + elementTopDelta;

      isRestoringRef.current = true;

      if (isWindow(scrollTarget)) {
        window.scrollTo({ top: targetScrollTop, left: 0 });
      } else {
        (scrollTarget as Element).scrollTop = targetScrollTop;
      }

      // Clean up the stored data after restoration
      sessionStorage.removeItem(`${storageKey}-${router.asPath}`);
      
      // Reset flag after a short delay
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 100);
    } catch (error) {
      console.warn("Failed to restore scroll position:", error);
      isRestoringRef.current = false;
    }
  }, [enabled, router.asPath, storageKey, options]);

  // Restore scroll position when the active tab changes (page loads)
  useLayoutEffect(() => {
    // Small delay to ensure the page content is fully rendered
    const timeoutId = setTimeout(restoreScrollPosition, 50);
    return () => clearTimeout(timeoutId);
  }, [activeTab, restoreScrollPosition]);

  // Clean up old stored data on unmount
  useLayoutEffect(() => {
    return () => {
      // Clean up any stored scroll data older than 1 minute
      try {
        const keys = Object.keys(sessionStorage);
        keys.forEach((key) => {
          if (key.startsWith(storageKey)) {
            try {
              const data = JSON.parse(sessionStorage.getItem(key) || "{}");
              if (Date.now() - (data.timestamp || 0) > 60000) {
                sessionStorage.removeItem(key);
              }
            } catch {
              sessionStorage.removeItem(key);
            }
          }
        });
      } catch (error) {
        // Ignore errors during cleanup
      }
    };
  }, [storageKey]);

  return [elementRef, startPreserveScroll];
}

export default usePreserveScrollOnTabSwitch;