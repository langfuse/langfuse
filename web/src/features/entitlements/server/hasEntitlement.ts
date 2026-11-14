import { type Plan } from "@langfuse/shared";

import {
  entitlementAccess,
  type Entitlement,
} from "@/src/features/entitlements/constants/entitlements";

/**
 * Check if user has access to a specific entitlement based on the plan.
 */
export const hasEntitlementBasedOnPlan = ({
  plan,
  entitlement,
}: {
  plan: Plan | null;
  entitlement: Entitlement;
}) => {
  if (!plan) return false;
  return entitlementAccess[plan].entitlements.includes(entitlement);
};
