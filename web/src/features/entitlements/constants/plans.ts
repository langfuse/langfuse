export const planLabels = {
  oss: "OSS",
  "cloud:hobby": "Hobby",
  "cloud:pro": "Pro",
  "cloud:team": "Team",
  "self-hosted:enterprise": "Enterprise",
} as const;

export type Plan = keyof typeof planLabels;

export const plans = Object.keys(planLabels) as Plan[];

// This function is kept here to ensure consistency when updating plan names in the future.
export const isCloudPlan = (plan: Plan) => plan.startsWith("cloud");
