import {
  entitlementAccess,
  type EntitlementLimits,
  type Entitlement,
  type EntitlementLimit,
} from "@/src/features/entitlements/constants/entitlements";
import { type Plan } from "@langfuse/shared";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

/**
 * Hook to get the plan of the current organization or self-hosted instance.
 */
export const usePlan = (): Plan | undefined => {
  const router = useRouter();
  const session = useSession();
  const projectId = router.query.projectId;
  const organizationId = router.query.organizationId;

  // if on a self-hosted instance with an active license, get the plan of the self-hosted instance
  const selfHostedInstancePlan =
    session.data?.environment.selfHostedInstancePlan;
  if (selfHostedInstancePlan) return selfHostedInstancePlan;

  // if on an organization page, get the plan of the organization
  if (organizationId) {
    const org = session.data?.user?.organizations.find(
      (org) => org.id === organizationId,
    );
    return org?.plan ?? "oss";
  }

  // if on a project page, get the plan of the organization that the project belongs to
  if (projectId) {
    const org = session.data?.user?.organizations.find((org) =>
      org.projects.some((proj) => proj.id === projectId),
    );
    return org?.plan ?? "oss";
  }

  return undefined;
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
  const session = useSession();
  if (session.data?.user?.admin) return true;
  if (!entitlement) return true;
  return entitlements.includes(entitlement);
};

/**
 * Hook to check if the current organization or self-hosted instance has a specific entitlement.
 */
export const useHasEntitlement = (entitlement: Entitlement): boolean => {
  const entitlements = useEntitlements();
  const session = useSession();
  if (session.data?.user?.admin) return true;
  return entitlements.includes(entitlement);
};

/**
 * Hook to get the entitlement limits of the current organization or self-hosted instance.
 * @returns the entitlement limits of the current organization or self-hosted instance, including values of limits and false if unlimited.
 */
export const useEntitlementLimits = (): EntitlementLimits => {
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

  const session = useSession();
  if (session.data?.user?.admin) return false;

  return limits[limit];
};
