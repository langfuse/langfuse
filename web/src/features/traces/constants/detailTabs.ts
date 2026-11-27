export const DETAIL_TABS = ["preview", "attributes", "scores", "log"] as const;

export type DetailTab = (typeof DETAIL_TABS)[number];
