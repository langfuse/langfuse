import { useSyncExternalStore } from "react";

// tailwind default breakpoint, corresponds to `md`, https://tailwindcss.com/docs/responsive-design
const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

/**
 * True when the viewport is below the `md` breakpoint. Reads the media query
 * synchronously, so it is correct on the first client render (unlike an
 * effect-initialized hook) — safe to gate mount-only behavior like `autoFocus`.
 * SSR has no viewport, so it assumes desktop and hydration corrects it.
 */
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
