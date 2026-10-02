import { env } from "@/src/env.mjs";
import {
  getSelfHostedInstancePlanServerSide,
  hasEntitlementBasedOnPlan,
} from "@/src/features/entitlements/server";

export function canCreateOrganizations(userEmail: string | null): boolean {
  const instancePlan = getSelfHostedInstancePlanServerSide();

  // If no allowlist is configured, or the entitlement is unavailable, allow
  // all users to create organizations.
  if (
    !env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS ||
    !hasEntitlementBasedOnPlan({
      plan: instancePlan,
      entitlement: "self-host-allowed-organization-creators",
    })
  ) {
    return true;
  }

  if (!userEmail) {
    return false;
  }

  const allowedOrgCreators =
    env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS.toLowerCase().split(",");

  return allowedOrgCreators.includes(userEmail.toLowerCase());
}
