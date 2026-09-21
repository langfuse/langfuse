/**
 * App overlay layers, ordered from lowest to highest.
 *
 * `agent` is overlay presentations of the in-app assistant (detached,
 * fullscreen, handheld). The default docked sidebar is in-flow in the
 * authenticated layout, not this layer.
 */
export const LAYER_ORDER = [
  "panel",
  "agent",
  "modal",
  "popover",
  "tooltip",
  "toast",
] as const;

export type LayerName = (typeof LAYER_ORDER)[number];
