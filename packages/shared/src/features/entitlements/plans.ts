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
 * ClickHouse Billing (CHB) identifies plans by code. These are CHB's own codes,
 * mirrored verbatim from `LANGFUSE_FIXED_PLAN_NAME_TO_PLAN_CODE` in
 * `packages/cp-billing/src/pricing/LangfusePricing.ts` (ClickHouse/control-plane)
 * — CHB validates request bodies against exactly this set and rejects anything
 * else with a 400, so these are not ours to derive from our own tier names.
 *
 * Two things do not line up with Langfuse naming, deliberately:
 * - `LANGFUSE_PRO_TEAMS` is CHB's code for the Team tier.
 * - `LANGFUSE_HOBBY` exists even though a free Langfuse org carries no CHB
 *   bundle. We never send it, because no Stripe product maps to `cloud:hobby`
 *   and the code is only ever produced by that lookup; it is listed so a Hobby
 *   bundle reported *by* CHB resolves to a plan instead of being discarded.
 *
 * CHB also defines `LANGFUSE_USAGE`, deliberately absent here: it is the metered
 * component rather than a tier, so it has no Langfuse plan to resolve to.
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
