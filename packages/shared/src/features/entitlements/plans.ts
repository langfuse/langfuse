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

/**
 * ClickHouse Billing (CHB) identifies plans by code. These are the lowercased
 * paid tiers of `cloudConfigPlans` — there is deliberately no code for the free
 * tier, because a free org simply carries no CHB bundle.
 *
 * Lives here rather than next to the Stripe catalogue in web because
 * `cloudConfigSchema` validates stored plan codes against it, and shared cannot
 * import from web.
 */
export const chbPlanCodes = ["core", "pro", "team", "enterprise"] as const;

export type ChbPlanCode = (typeof chbPlanCodes)[number];

/**
 * Total mapping from CHB plan code to Langfuse plan. Total on purpose: callers
 * get an exhaustive lookup with no unmapped-code branch to handle, and adding a
 * code without a plan is a compile error.
 */
export const chbPlanCodeToPlan = {
  core: "cloud:core",
  pro: "cloud:pro",
  team: "cloud:team",
  enterprise: "cloud:enterprise",
} as const satisfies Record<ChbPlanCode, Plan>;
