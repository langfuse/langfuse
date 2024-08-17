export const planLabels = {
  oss: "Open Source",
  "cloud:hobby": "Hobby",
  "cloud:pro": "Pro",
  "cloud:team": "Team",
  "self-hosted:enterprise": "Self-Hosted Enterprise",
} as const;

export type Plan = keyof typeof planLabels;

export const plans = Object.keys(planLabels) as Plan[];
