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
 * Hook to get the plan of the current organization or project.
 */
export const useOrganizationPlan = (): Plan | undefined => {
  const router = useRouter();
  const session = useSession();
  const projectId = router.query.projectId;
  const organizationId = router.query.organizationId;

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
 * Hook to get the entitlements of the current organization.
 */
export const useOrgEntitlements = (): Entitlement[] => {
  const plan = useOrganizationPlan();
  const availableEntitlements = entitlementAccess[plan ?? "oss"].entitlements;
  return availableEntitlements;
};

/**
 * Hook to check if the current organization has a specific entitlement.
 */
export const useHasOrgEntitlement = (entitlement: Entitlement): boolean => {
  const orgEntitlements = useOrgEntitlements();

  const session = useSession();
  if (session.data?.user?.admin) return true;

  return orgEntitlements.includes(entitlement);
};

/**
 * Hook to get the entitlement limits of the current organization.
 * @returns the entitlement limits of the current organization, including values of limits and false if unlimited.
 */
export const useOrgEntitlementLimits = (): EntitlementLimits => {
  const plan = useOrganizationPlan();
  return entitlementAccess[plan ?? "oss"].entitlementLimits;
};

/**
 * Hook to use the entitlement limit of the current organization.
 * @returns the limit value or false if unlimited
 */
export const useOrgEntitlementLimit = (
  limit: EntitlementLimit,
): number | false => {
  const limits = useOrgEntitlementLimits();

  const session = useSession();
  if (session.data?.user?.admin) return false;

  return limits[limit];
};
