export const DETAIL_TABS = [
  "preview",
  "attributes",
  "scores",
  "log",
  "topics",
] as const;

export type DetailTab = (typeof DETAIL_TABS)[number];
