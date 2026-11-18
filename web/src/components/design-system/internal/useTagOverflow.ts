import { useLayoutEffect, useRef, useState } from "react";

/**
 * Which tags in a right-aligned row fit fully, so the rest can collapse into
 * "+N". `leadingHiddenWidth` is the empty space before the first visible tag,
 * left by a tag that only partly fits, which the "+N" tag shifts over.
 */
export function useTagOverflow(itemKeys: string[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef(new Map<string, HTMLElement>());
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [leadingHiddenWidth, setLeadingHiddenWidth] = useState(0);
  const keysSignature = itemKeys.join("\u0000");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const bounds = container.getBoundingClientRect();
      const next = new Set<string>();
      let leftmostVisible = Number.POSITIVE_INFINITY;
      tagRefs.current.forEach((tag, key) => {
        const tagBounds = tag.getBoundingClientRect();
        if (
          tagBounds.left >= bounds.left - 1 &&
          tagBounds.right <= bounds.right + 1
        ) {
          next.add(key);
          leftmostVisible = Math.min(leftmostVisible, tagBounds.left);
        }
      });
      setLeadingHiddenWidth(
        Number.isFinite(leftmostVisible)
          ? Math.max(0, Math.round(leftmostVisible - bounds.left))
          : 0,
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
    leadingHiddenWidth,
  };
}
