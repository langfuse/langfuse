import { type Plan } from "@langfuse/shared";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import {
  entitlementAccess,
  type EntitlementLimits,
  type Entitlement,
  type EntitlementLimit,
} from "@/src/features/entitlements/constants/entitlements";
import { getSessionPlan } from "@/src/features/rbac/new/entitlements";

/**
 * Hook to get the plan of the current organization or self-hosted instance.
 */
export const usePlan = (): Plan | undefined => {
  const router = useRouter();
  const session = useSession();
  return getSessionPlan(session.data, {
    projectId: router.query.projectId,
    organizationId: router.query.organizationId,
  });
};

/**
 * Hook to get the entitlements of the current organization or self-hosted instance.
 */
export const useEntitlements = (): Entitlement[] => {
  const plan = usePlan();
  const availableEntitlements = entitlementAccess[plan ?? "oss"].entitlements;
  return availableEntitlements;
};

/**
 * Hook to check if the current organization or self-hosted instance has a specific entitlement.
 * If the entitlement is not provided, it will return true.
 */
export const useOptionalEntitlement = (entitlement?: Entitlement): boolean => {
  const entitlements = useEntitlements();
  if (!entitlement) return true;
  return entitlements.includes(entitlement);
};

/**
 * Hook to check if the current organization or self-hosted instance has a specific entitlement.
 */
export const useHasEntitlement = (entitlement: Entitlement): boolean => {
  const entitlements = useEntitlements();
  return entitlements.includes(entitlement);
};

/**
 * Hook to get the entitlement limits of the current organization or self-hosted instance.
 * @returns the entitlement limits of the current organization or self-hosted instance, including values of limits and false if unlimited.
 */
const useEntitlementLimits = (): EntitlementLimits => {
  const plan = usePlan();
  return entitlementAccess[plan ?? "oss"].entitlementLimits;
};

/**
 * Hook to use the entitlement limit of the current organization or self-hosted instance.
 * @returns the limit value or false if unlimited
 */
export const useEntitlementLimit = (
  limit: EntitlementLimit,
): number | false => {
  const limits = useEntitlementLimits();
  return limits[limit];
};
