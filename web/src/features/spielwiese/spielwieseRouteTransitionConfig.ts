import { type GlimmDefaults } from "glimm/react";

export const glimmRouteTransitionDefaults = {
  palette: {
    a: [0.86, 0.9, 0.94],
    b: [0.13, 0.12, 0.11],
    c: [0.46, 0.46, 0.46],
    d: [0.62, 0.59, 0.55],
  },
  direction: "ltr",
  easing: "easeInOutCubic",
  sweepMs: 900,
  outroMs: 260,
  midpoint: 0.5,
  peakAlpha: 0.3,
  brightness: 0.64,
  bandTight: 10,
  waveAmount: 0.1,
  rippleAmount: 0.04,
  waveSpeed: 0.35,
  swellAmount: 0.14,
  zIndex: 9998,
} satisfies GlimmDefaults;

export const routeTransitionCleanupFallbackMs = 1400;
export const routeTransitionCrossfadeMs = 420;
export const routeTransitionCleanupPollMs = 80;
export const routeTransitionNavigateDelayMs = Math.round(
  glimmRouteTransitionDefaults.sweepMs * glimmRouteTransitionDefaults.midpoint,
);
export const routeTransitionVisualFallbackMs =
  glimmRouteTransitionDefaults.sweepMs +
  glimmRouteTransitionDefaults.outroMs +
  260;

export function waitForRouteTransitionSignal(
  signal: Promise<unknown>,
  fallbackMs: number,
) {
  return Promise.race([
    signal.catch(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, fallbackMs);
    }),
  ]);
}
