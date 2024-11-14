export const planLabels = {
  oss: "OSS",
  "cloud:hobby": "Hobby",
  "cloud:pro": "Pro",
  "cloud:team": "Team",
  "self-hosted:pro": "Pro (self-hosted)",
  "self-hosted:enterprise": "Enterprise (self-hosted)",
} as const;

export type Plan = keyof typeof planLabels;

export const plans = Object.keys(planLabels) as Plan[];

// This function is kept here to ensure consistency when updating plan names in the future.
export const isCloudPlan = (plan: Plan) => plan.startsWith("cloud");

export const isPlan = (value: string): value is Plan =>
  plans.includes(value as Plan);
