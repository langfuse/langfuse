export const DETAIL_TABS = [
  "preview",
  "messages",
  "attributes",
  "skills",
  "scores",
  "log",
] as const;

export type DetailTab = (typeof DETAIL_TABS)[number];
