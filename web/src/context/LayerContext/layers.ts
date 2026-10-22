/** App overlay layers, ordered from lowest to highest. */
export const LAYER_ORDER = [
  "panel",
  "agent",
  "modal",
  "popover",
  "tooltip",
  "toast",
] as const;

export type LayerName = (typeof LAYER_ORDER)[number];
