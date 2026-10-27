/** Marks the stage's own DOM so captures and change tracking skip it. */
export const ASSISTANT_STAGE_ROOT_ATTRIBUTE = "data-assistant-stage";

/** Marks the launcher, whose own hover/press must not invalidate a warm capture. */
export const ASSISTANT_STAGE_LAUNCHER_ATTRIBUTE =
  "data-assistant-stage-launcher";

/** Transient overlays are not part of the page the user hands over. */
export const CAPTURE_EXCLUDED_SELECTORS = [
  `[${ASSISTANT_STAGE_ROOT_ATTRIBUTE}]`,
  "[data-overlay-root] > [data-layer='tooltip']",
  "[data-overlay-root] > [data-layer='toast']",
  "[data-overlay-root] > [data-layer='agent']",
  "[data-overlay-root] > [data-layer='stage']",
];

export const ASSISTANT_STAGE_TIMINGS = {
  openMs: 760,
  closeMs: 580,
  reducedMotionMs: 160,
  /** Cross-fade from the flying texture to the live page or bubble image. */
  handoffMs: 140,
} as const;

/** Corner radius of the context thumbnail in the message bubble, in CSS px. */
export const CONTEXT_THUMBNAIL_RADIUS_PX = 10;
