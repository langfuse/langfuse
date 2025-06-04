// used on organization.cloudConfig.plan
export const cloudConfigPlans = [
  "Hobby",
  "Core",
  "Pro",
  "Team",
  "Enterprise",
] as const;

export const planLabels = {
  oss: "OSS",
  "cloud:hobby": "Hobby",
  "cloud:core": "Core",
  "cloud:pro": "Pro",
  "cloud:team": "Team",
  "cloud:enterprise": "Enterprise",
  "self-hosted:pro": "Pro (self-hosted)",
  "self-hosted:enterprise": "Enterprise (self-hosted)",
} as const;

export type Plan = keyof typeof planLabels;

export const plans = Object.keys(planLabels) as Plan[];

// These functions are kept here to ensure consistency when updating plan names in the future.
export const isCloudPlan = (plan?: Plan) => plan?.startsWith("cloud");
export const isSelfHostedPlan = (plan?: Plan) =>
  plan?.startsWith("self-hosted");

export const isPlan = (value: string): value is Plan =>
  plans.includes(value as Plan);
