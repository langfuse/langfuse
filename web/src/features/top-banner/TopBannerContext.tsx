import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TopBannerEntry = {
  height: number;
  order: number;
};

interface TopBannerContextValue {
  bannerHeight: number;
  setTopBannerHeight: (bannerId: string, height: number, order: number) => void;
  getTopBannerOffset: (order: number) => number;
}

const TopBannerContext = createContext<TopBannerContextValue | null>(null);

export function TopBannerProvider({ children }: { children: ReactNode }) {
  const [topBannerHeights, setTopBannerHeights] = useState<
    Record<string, TopBannerEntry>
  >({});

  const setTopBannerHeight = useCallback(
    (bannerId: string, height: number, order: number) => {
      setTopBannerHeights((prev) => {
        if (height <= 0) {
          if (!(bannerId in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[bannerId];
          return next;
        }

        const current = prev[bannerId];
        if (current && current.height === height && current.order === order) {
          return prev;
        }

        return {
          ...prev,
          [bannerId]: { height, order },
        };
      });
    },
    [],
  );

  const orderedTopBanners = useMemo(
    () =>
      Object.entries(topBannerHeights)
        .map(([id, entry]) => ({
          id,
          ...entry,
        }))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [topBannerHeights],
  );

  const bannerHeight = useMemo(
    () =>
      orderedTopBanners.reduce((totalHeight, banner) => {
        return totalHeight + banner.height;
      }, 0),
    [orderedTopBanners],
  );

  const getTopBannerOffset = useCallback(
    (targetOrder: number) => {
      let offset = 0;
      for (const banner of orderedTopBanners) {
        if (banner.order >= targetOrder) {
          break;
        }
        offset += banner.height;
      }
      return offset;
    },
    [orderedTopBanners],
  );

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
    <TopBannerContext.Provider
      value={{
        bannerHeight,
        setTopBannerHeight,
        getTopBannerOffset,
      }}
    >
      {children}
    </TopBannerContext.Provider>
  );
}

export function useTopBanner() {
  const context = useContext(TopBannerContext);
  if (!context) {
    throw new Error("useTopBanner must be used within TopBannerProvider");
  }
  return context;
}
