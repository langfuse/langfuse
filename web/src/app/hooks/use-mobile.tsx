import { useSyncExternalStore } from "react";

// tailwind default breakpoint, corresponds to `md`, https://tailwindcss.com/docs/responsive-design
const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
// Phone-sized in EITHER orientation: narrow, or a touch screen that is short
// (an iPhone in landscape is wider than `md` but only ~390px tall).
const HANDHELD_QUERY = `${MOBILE_QUERY}, (pointer: coarse) and (max-height: ${MOBILE_BREAKPOINT - 1}px)`;

// Guarded so it's safe where `matchMedia` is absent (jsdom tests, SSR, old
// browsers) — treat those as non-mobile. Module-level so the store functions
// stay referentially stable across renders.
function createMediaQueryStore(query: string) {
  return {
    subscribe(onStoreChange: () => void) {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    getSnapshot() {
      if (typeof window === "undefined" || !window.matchMedia) return false;
      return window.matchMedia(query).matches;
    },
  };
}

const mobileStore = createMediaQueryStore(MOBILE_QUERY);
const handheldStore = createMediaQueryStore(HANDHELD_QUERY);

/**
 * True when the viewport is below the `md` breakpoint. Reads the media query
 * synchronously, so it is correct on the first client render (unlike an
 * effect-initialized hook) — safe to gate mount-only behavior like `autoFocus`.
 * SSR has no viewport, so it assumes desktop and hydration corrects it.
 */
export function useIsMobile() {
  return useSyncExternalStore(
    mobileStore.subscribe,
    mobileStore.getSnapshot,
    () => false,
  );
}

/**
 * True on phone-sized screens in either orientation — `useIsMobile()` plus a
 * short touch screen, which is a phone held sideways. Use it for presentation
 * that a rotation must not undo (full-screen panels, suppressing drag/resize
 * affordances that need a precise pointer).
 */
export function useIsHandheld() {
  return useSyncExternalStore(
    handheldStore.subscribe,
    handheldStore.getSnapshot,
    () => false,
  );
}
