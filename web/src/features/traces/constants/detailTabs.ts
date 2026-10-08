export const DETAIL_TABS = [
  "preview",
  "messages",
  "attributes",
  "scores",
  "log",
] as const;

export type DetailTab = (typeof DETAIL_TABS)[number];

export const DETAIL_TAB_LABELS: Record<DetailTab, string> = {
  preview: "Preview",
  messages: "Messages",
  attributes: "Attributes",
  scores: "Scores",
  log: "Log View",
};
