import {
  entitlementAccess,
  type UsageBasedEntitlement,
  type FeatureBasedEntitlement,
  type HasEntitlementParams,
  usageCheckers,
  type Entitlement,
} from "@/src/features/entitlements/constants/entitlements";
import { type Plan } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";

const isUsageBasedEntitlement = (
  entitlement: Entitlement,
): entitlement is UsageBasedEntitlement => {
  return typeof entitlement === "string" && entitlement in usageCheckers;
};

export const getEntitlements = (plan: Plan): Entitlement[] => {
  const availableEntitlements = entitlementAccess[plan];
  const { features, usageBasedFeatures } = availableEntitlements;
  return {
    ...features,
    ...usageBasedFeatures,
  };
};

export const hasUsageEntitlementQuota = (
  entitlement: UsageBasedEntitlement,
  plan: Plan,
  isViewOnly = false,
): boolean => {
  if (isViewOnly) return true;
  const { usageBasedFeatures } = entitlementAccess[plan];
  const usageLimit = usageBasedFeatures[entitlement];

  if (usageLimit === true) {
    return true;
  } else if (typeof usageLimit === "number") {
    if (usageLimit === 0) {
      return false;
    } else {
      return true; // TODO: Check against the usage limit
    }
    // } else if (org) {
    //   // Check against the usage limit
    //   const currentUsage = await usageCheckers[entitlement](org.id);
    //   return currentUsage < usageLimit;
    // }
  }

  return false;
};

/**
 * Check if user has access to a specific entitlement based on the session user (to be used server-side).
 */
export const hasEntitlement = (p: HasEntitlementParams): boolean => {
  if (p.sessionUser.admin) return true;
  const org =
    "projectId" in p
      ? p.sessionUser.organizations.find((org) =>
          org.projects.some((proj) => proj.id === p.projectId),
        )
      : p.sessionUser.organizations.find((org) => org.id === p.orgId);

  const plan: Plan = org?.plan ?? "oss";
  const availableEntitlements = entitlementAccess[plan];
  const { features } = availableEntitlements;

  // Check for feature-based entitlements
  if (features.includes(p.entitlement as FeatureBasedEntitlement)) {
    return true;
  }

  // Check for usage-based entitlements
  if (!isUsageBasedEntitlement(p.entitlement)) {
    return false;
  }

  return hasUsageEntitlementQuota(p.entitlement, plan, p.isViewOnly);
};

export const throwIfNoEntitlement = async (p: HasEntitlementParams) => {
  if (!hasEntitlement(p)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Unauthorized, user does not have access to entitlement: " +
        p.entitlement,
    });
  }
};
