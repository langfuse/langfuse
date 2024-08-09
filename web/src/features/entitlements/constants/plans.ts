const plans = [
  "oss",
  "cloud:hobby",
  "cloud:pro",
  "cloud:team",
  "self-hosted:enterprise",
] as const;
export type Plan = (typeof plans)[number];
