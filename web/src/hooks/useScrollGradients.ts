import { useCallback, useEffect, useState } from "react";

const SCROLL_EDGE_THRESHOLD_PX = 10;

/**
 * Tracks whether a scroll container has hidden content above or below it.
 * Re-measures when the container resizes or its DOM content changes so callers
 * can render scroll affordances at the active edges.
 */
export function useScrollGradients<TElement extends HTMLElement>(
  enabled: boolean,
) {
  const [element, setElement] = useState<TElement | null>(null);
  const [{ top, bottom }, setScrollGradients] = useState({
    top: false,
    bottom: false,
  });
  const register = useCallback((element: TElement | null) => {
    setElement(element);
  }, []);
  const recompute = useCallback(() => {
    if (!element || !enabled) return;

    const maxScrollTop = element.scrollHeight - element.clientHeight;
    const nextTop =
      maxScrollTop > SCROLL_EDGE_THRESHOLD_PX &&
      element.scrollTop > SCROLL_EDGE_THRESHOLD_PX;
    const nextBottom =
      maxScrollTop > SCROLL_EDGE_THRESHOLD_PX &&
      element.scrollTop < maxScrollTop - SCROLL_EDGE_THRESHOLD_PX;

    setScrollGradients((current) => {
      if (current.top === nextTop && current.bottom === nextBottom) {
        return current;
      }
      return { top: nextTop, bottom: nextBottom };
    });
  }, [element, enabled]);

  useEffect(() => {
    if (!element || !enabled) return;

    const update = () => recompute();
    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [element, enabled, recompute]);

  return { register, recompute, top, bottom };
}
