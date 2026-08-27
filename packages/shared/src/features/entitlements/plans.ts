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
 * ClickHouse Billing (CHB) identifies plans by code.
 *
 * Lives here rather than next to the Stripe catalogue in web because
 * `cloudConfigSchema` validates stored plan codes against it, and shared cannot
 * import from web.
 */
export const chbPlanCodes = [
  "LANGFUSE_HOBBY",
  "LANGFUSE_CORE",
  "LANGFUSE_PRO",
  "LANGFUSE_PRO_TEAMS",
  "LANGFUSE_ENTERPRISE",
] as const;

export type ChbPlanCode = (typeof chbPlanCodes)[number];

/**
 * Total mapping from CHB plan code to Langfuse plan. Total on purpose: callers
 * get an exhaustive lookup with no unmapped-code branch to handle, and adding a
 * code without a plan is a compile error.
 */
export const chbPlanCodeToPlan = {
  LANGFUSE_HOBBY: "cloud:hobby",
  LANGFUSE_CORE: "cloud:core",
  LANGFUSE_PRO: "cloud:pro",
  LANGFUSE_PRO_TEAMS: "cloud:team",
  LANGFUSE_ENTERPRISE: "cloud:enterprise",
} as const satisfies Record<ChbPlanCode, Plan>;
