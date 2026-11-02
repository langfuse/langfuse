import { useEffect, type RefObject } from "react";

export function useResizeObserver<TElement extends Element>(
  ref: RefObject<TElement | null>,
  onResize: () => void,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    onResize();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(onResize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, onResize]);
}
