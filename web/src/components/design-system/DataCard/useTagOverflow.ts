import { useLayoutEffect, useRef, useState } from "react";

/**
 * Which tags in a row fit fully, so the rest can collapse into "+N", as in
 * `MultiSelectTagInput`. `trailingHiddenWidth` is the empty space after the
 * last visible tag, which the "+N" tag shifts left over.
 */
export function useTagOverflow(itemKeys: string[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef(new Map<string, HTMLElement>());
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [trailingHiddenWidth, setTrailingHiddenWidth] = useState(0);
  const keysSignature = itemKeys.join("\u0000");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const bounds = container.getBoundingClientRect();
      const next = new Set<string>();
      let rightmostVisible = 0;
      tagRefs.current.forEach((tag, key) => {
        const tagBounds = tag.getBoundingClientRect();
        if (
          tagBounds.left >= bounds.left - 1 &&
          tagBounds.right <= bounds.right + 1
        ) {
          next.add(key);
          rightmostVisible = Math.max(rightmostVisible, tagBounds.right);
        }
      });
      setTrailingHiddenWidth(
        rightmostVisible > 0 ? Math.max(0, bounds.right - rightmostVisible) : 0,
      );
      setVisibleKeys((current) =>
        current.size === next.size && [...current].every((key) => next.has(key))
          ? current
          : next,
      );
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    tagRefs.current.forEach((tag) => observer.observe(tag));
    return () => observer.disconnect();
  }, [keysSignature]);

  const registerTag = (key: string) => (tag: HTMLElement | null) => {
    if (tag) tagRefs.current.set(key, tag);
    else tagRefs.current.delete(key);
  };

  return {
    containerRef,
    registerTag,
    isVisible: (key: string) => visibleKeys.has(key),
    hiddenCount: itemKeys.filter((key) => !visibleKeys.has(key)).length,
    trailingHiddenWidth,
  };
}
