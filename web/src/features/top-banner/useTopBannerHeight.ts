import { useEffect, useRef } from "react";

export function useTopBannerHeight() {
  const topBannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = topBannerRef.current;
    if (!element) return;

    const updateBannerHeight = () => {
      document.documentElement.style.setProperty(
        "--banner-height",
        `${element.offsetHeight}px`,
      );
    };

    updateBannerHeight();
    const resizeObserver = new ResizeObserver(updateBannerHeight);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty("--banner-height", "0px");
    };
  }, []);

  return topBannerRef;
}
