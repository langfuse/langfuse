import { useEffect, useRef, useState } from "react";

export type ElementSize = {
  width: number;
  height: number;
};

export function useElementSize<TElement extends HTMLElement>() {
  const ref = useRef<TElement>(null);
  const [size, setSize] = useState<ElementSize>();

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize({ width, height });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return [ref, size] as const;
}
