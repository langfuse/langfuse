import { type Plan } from "@langfuse/shared";

import {
  type CloudPlan,
  cloudPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";

/** Whether a plan is one of the Cloud plans a customer can be on or move to. */
export function isCloudPlan(plan: Plan | undefined): plan is CloudPlan {
  return cloudPlans.some((cloudPlan) => cloudPlan === plan);
}
