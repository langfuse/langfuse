import { useCallback, useLayoutEffect, useRef } from "react";

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

export interface UsePreserveRelativeScrollOptions {
  getScrollTarget?: (clickedElement: Element) => ScrollTarget;
  enabled?: boolean;
}

/**
 * Preserves the referenced element's relative scroll position when content size changes.
 *
 * @param options - Optional configuration for scroll target detection and enabling the behavior.
 * @param layoutDeps - Values that change when the layout will reflow due to your interaction
 * (for example, the selected tab value). Provide stable, memoized values; avoid passing
 * freshly created objects or inline functions.
 */
export function usePreserveRelativeScroll<T extends Element = Element>(
  layoutDeps: ReadonlyArray<unknown> = [],
  options?: UsePreserveRelativeScrollOptions,
): [React.RefObject<T | null>, () => void] {
  const enabled = options?.enabled ?? true;
  const beforeTopRef = useRef<number | null>(null);
  const targetRef = useRef<ScrollTarget | null>(null);
  const didUserScrollRef = useRef<boolean>(false);
  const elementRef = useRef<T | null>(null);
  const compensatedRef = useRef<boolean>(false);

  const attachScrollListener = useCallback(() => {
    const target = targetRef.current;
    const cancel = () => {
      didUserScrollRef.current = true;
    };
    const keydownHandler = (e: KeyboardEvent) => {
      const keys = [
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
      ];
      if (keys.includes(e.key)) cancel();
    };
    window.addEventListener("wheel", cancel, { passive: true, once: true });
    window.addEventListener("touchmove", cancel, { passive: true, once: true });
    window.addEventListener(
      "keydown",
      keydownHandler as EventListener,
      {
        once: true,
      } as AddEventListenerOptions,
    );
    if (target && !isWindow(target)) {
      target.addEventListener(
        "wheel",
        cancel as EventListener,
        {
          passive: true,
          once: true,
        } as AddEventListenerOptions,
      );
      target.addEventListener(
        "touchmove",
        cancel as EventListener,
        {
          passive: true,
          once: true,
        } as AddEventListenerOptions,
      );
      target.addEventListener(
        "keydown",
        keydownHandler as EventListener,
        {
          once: true,
        } as AddEventListenerOptions,
      );
    }
  }, []);

  const removeRefs = useCallback(() => {
    beforeTopRef.current = null;
    targetRef.current = null;
    didUserScrollRef.current = false;
    compensatedRef.current = false;
  }, []);

  const performCompensation = useCallback(
    (element: T) => {
      if (compensatedRef.current) return;
      const beforeTop = beforeTopRef.current;
      const target = targetRef.current;
      if (beforeTop == null || !target) return;
      if (didUserScrollRef.current) {
        removeRefs();
        return;
      }
      const afterTop = element.getBoundingClientRect().top;
      const delta = afterTop - beforeTop;
      if (Math.abs(delta) < 1) {
        removeRefs();
        return;
      }
      if (isWindow(target)) {
        window.scrollBy({ top: delta, left: 0 });
      } else {
        (target as Element).scrollTop += delta;
      }
      compensatedRef.current = true;
      removeRefs();
    },
    [removeRefs],
  );

  const startPreserveScroll = useCallback(() => {
    if (!enabled) return;
    const element = elementRef.current;
    if (!element || !element.getBoundingClientRect) return;
    const rect = element.getBoundingClientRect();
    beforeTopRef.current = rect.top;
    targetRef.current =
      options?.getScrollTarget?.(element) ??
      findNearestScrollContainer(element);
    didUserScrollRef.current = false;
    attachScrollListener();
  }, [attachScrollListener, enabled, options]);

  const compensateInLayout = useCallback(() => {
    if (!enabled) return;
    const element = elementRef.current;
    if (!element) return;
    performCompensation(element);
  }, [enabled, performCompensation]);

  useLayoutEffect(() => {
    compensateInLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, layoutDeps);

  return [elementRef, startPreserveScroll];
}

export default usePreserveRelativeScroll;
