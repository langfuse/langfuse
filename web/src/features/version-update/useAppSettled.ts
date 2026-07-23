import { useSyncExternalStore } from "react";

/**
 * How long after the app first mounts before the version-update banner is
 * allowed to appear. During the initial mount/hydration window the layout
 * flickers and React StrictMode double-invokes mounts; because the banner
 * renders through an overlay portal, a mount landing in that churn is torn down
 * and recreated, replaying its entrance animation (a visible "jump"). Holding it
 * back until the app is quiet means it mounts exactly once, cleanly — and reads
 * better (no banner flashing in during startup).
 */
export const APP_SETTLE_DELAY_MS = 5000;

/**
 * A one-shot "the app has settled after first render" gate as an external store.
 *
 * It is module-scoped (a singleton below), NOT component state, so the settled
 * flag survives banner unmount/remount — e.g. when `AppLayout` switches between
 * `AuthenticatedLayout` and `MinimalLayout` (navigating to `/onboarding`,
 * `/auth/*`, `/public/*` and back). A component-local timer would restart the
 * grace period on every such remount, re-hiding an already-acknowledged banner
 * for another {@link APP_SETTLE_DELAY_MS}. Once settled it stays settled, so
 * later mounts see `true` immediately.
 *
 * Exposed as a factory for deterministic testing; the app uses the singleton.
 */
export function createAppSettledGate(delayMs = APP_SETTLE_DELAY_MS) {
  let settled = false;
  let timerStarted = false;
  const listeners = new Set<() => void>();

  // The timer is the external system this store owns. Start it once, on first
  // subscription (the app's first client mount); it is idempotent across the
  // StrictMode subscribe/unsubscribe/subscribe cycle and across remounts.
  const startTimer = () => {
    if (timerStarted || settled) return;
    timerStarted = true;
    setTimeout(() => {
      settled = true;
      for (const listener of listeners) listener();
    }, delayMs);
  };

  return {
    subscribe(listener: () => void) {
      startTimer();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => settled,
    // Never settled on the server; the banner only exists in a live tab.
    getServerSnapshot: () => false,
  };
}

const appSettledGate = createAppSettledGate();

/**
 * `true` once the app has settled after first render (see
 * {@link createAppSettledGate}). Read via `useSyncExternalStore` — no
 * effect-driven state, and the value is shared across all consumers and
 * survives component remounts.
 */
export function useAppSettled(): boolean {
  return useSyncExternalStore(
    appSettledGate.subscribe,
    appSettledGate.getSnapshot,
    appSettledGate.getServerSnapshot,
  );
}
