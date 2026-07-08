import { useEffect, type RefObject } from "react";
import { useTopBanner } from "./TopBannerContext";

type UseTopBannerRegistrationParams<T extends HTMLElement> = {
  bannerId: string;
  order: number;
  isVisible: boolean;
  elementRef: RefObject<T | null>;
};

export function useTopBannerRegistration<T extends HTMLElement>({
  bannerId,
  order,
  isVisible,
  elementRef,
}: UseTopBannerRegistrationParams<T>) {
  const { setTopBannerHeight } = useTopBanner();

  useEffect(() => {
    if (!isVisible || !elementRef.current) {
      setTopBannerHeight(bannerId, 0, order);
      return;
    }

    const updateHeight = () => {
      if (elementRef.current) {
        setTopBannerHeight(bannerId, elementRef.current.offsetHeight, order);
      } else {
        setTopBannerHeight(bannerId, 0, order);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(elementRef.current);

    return () => {
      resizeObserver.disconnect();
      setTopBannerHeight(bannerId, 0, order);
    };
  }, [bannerId, order, isVisible, setTopBannerHeight, elementRef]);
}
