import { useState, useEffect, useRef } from "react";

/**
 * Custom hook to track playground window container size and provide responsive breakpoints
 *
 * Uses ResizeObserver to monitor the container width and provides boolean flags
 * for different responsive states based on the playground window size rather than
 * the browser window size.
 */
export const usePlaygroundWindowSize = () => {
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return {
    containerRef,
    width,
    isVeryCompact: width < 423,
    isCompact: width < 460,
  };
};
