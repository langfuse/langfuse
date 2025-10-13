import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface PaymentBannerContextValue {
  bannerHeight: number;
  setBannerHeight: (height: number) => void;
}

const PaymentBannerContext = createContext<PaymentBannerContextValue | null>(
  null,
);

export function PaymentBannerProvider({ children }: { children: ReactNode }) {
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    // Note: CSS vars allow us to reduce re-renders of child-components and correct
    // CSS animations. Prefer using the CSS var over consuming the hook below to adjust layouts.
    // Example:
    //    - <div className="h-[calc(100svh-var(--banner-height,0px))]"> --> correct height calculation
    document.documentElement.style.setProperty(
      "--banner-height",
      `${bannerHeight}px`,
    );
  }, [bannerHeight]);

  return (
    <PaymentBannerContext.Provider value={{ bannerHeight, setBannerHeight }}>
      {children}
    </PaymentBannerContext.Provider>
  );
}

export function usePaymentBannerHeight() {
  const context = useContext(PaymentBannerContext);
  if (!context) {
    throw new Error(
      "usePaymentBannerHeight must be used within PaymentBannerProvider",
    );
  }
  return context;
}
