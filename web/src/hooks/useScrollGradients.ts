import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks whether a scroll container has hidden content above or below it.
 * Re-measures when the container resizes or its DOM content changes so callers
 * can render scroll affordances at the active edges.
 */
export function useScrollGradients<TElement extends HTMLElement>(
  enabled: boolean,
) {
  const contentRef = useRef<TElement>(null);
  const [{ top, bottom }, setScrollGradients] = useState({
    top: false,
    bottom: false,
  });
  const register = useCallback((element: TElement | null) => {
    contentRef.current = element;
  }, []);
  const recompute = useCallback(() => {
    const element = contentRef.current;
    if (!element || !enabled) return;

    const maxScrollTop = element.scrollHeight - element.clientHeight;
    const nextTop = maxScrollTop > 1 && element.scrollTop > 1;
    const nextBottom = maxScrollTop > 1 && element.scrollTop < maxScrollTop - 1;

    setScrollGradients((current) => {
      if (current.top === nextTop && current.bottom === nextBottom) {
        return current;
      }
      return { top: nextTop, bottom: nextBottom };
    });
  }, [enabled]);

  useEffect(() => {
    const element = contentRef.current;
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
  }, [enabled, recompute]);

  return { register, recompute, top, bottom };
}
