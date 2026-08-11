import { useSyncExternalStore } from "react";

// tailwind default breakpoint, corresponds to `md`, https://tailwindcss.com/docs/responsive-design
const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

// Guarded so it's safe where `matchMedia` is absent (jsdom tests, SSR, old
// browsers) — treat those as non-mobile.
function getSnapshot() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * True when the viewport is below the `md` breakpoint. Reads the media query
 * synchronously, so it is correct on the first client render (unlike an
 * effect-initialized hook) — safe to gate mount-only behavior like `autoFocus`.
 * SSR has no viewport, so it assumes desktop and hydration corrects it.
 */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
