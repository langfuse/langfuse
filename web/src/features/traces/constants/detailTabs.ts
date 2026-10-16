export const DETAIL_TABS = [
  "preview",
  "messages",
  "attributes",
  "scores",
  "log",
  "visualizations",
] as const;

export type DetailTab = (typeof DETAIL_TABS)[number];
