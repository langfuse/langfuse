import type { CloudConfigSchema, Plan } from "@langfuse/shared";
import { getOrganizationPlanServerSide } from "@langfuse/shared/src/server";

/**
 * The org's plan as SFDC records it. SFDC has no trial tier, so an org on the
 * enterprise trial counts as Hobby, the plan it returns to when the trial ends.
 */
export function getSfdcResolvedPlan(cloudConfig?: CloudConfigSchema): Plan {
  const plan = getOrganizationPlanServerSide(cloudConfig);
  return plan === "cloud:enterprise-trial" ? "cloud:hobby" : plan;
}
