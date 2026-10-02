import { useCallback, useRef, useState } from "react";
import { useResizeObserver } from "@/src/hooks/useResizeObserver";

export type ElementSize = {
  width: number;
  height: number;
};

export function useElementSize<TElement extends HTMLElement>() {
  const ref = useRef<TElement>(null);
  const [size, setSize] = useState<ElementSize>();

  const updateSize = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const { width, height } = element.getBoundingClientRect();
    setSize({ width, height });
  }, []);

  useResizeObserver(ref, updateSize);

  return [ref, size] as const;
}
