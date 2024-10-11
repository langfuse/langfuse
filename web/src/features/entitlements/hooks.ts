import {
  type FeatureBasedEntitlement,
  type Entitlement,
  type UsageBasedEntitlement,
} from "@/src/features/entitlements/constants/entitlements";
import {
  getEntitlements,
  hasUsageEntitlementQuota,
} from "@/src/features/entitlements/server/hasEntitlement";
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
  const plan = useOrganizationPlan() ?? "oss";
  return getEntitlements(plan);
};

/**
 * Hook to check if the current organization has a specific entitlement.
 */
export const useHasOrgEntitlement = (
  entitlement: FeatureBasedEntitlement,
): boolean => {
  const orgEntitlements = useOrgEntitlements();

  const session = useSession();
  if (session.data?.user?.admin) return true;

  return orgEntitlements.includes(entitlement);
};

/**
 * Hook to check if the current organization has a specific usage-based entitlement.
 */
export const useHasOrgUsageBasedEntitlement = (
  entitlement: UsageBasedEntitlement,
  isViewOnly = false,
): boolean => {
  const plan = useOrganizationPlan() ?? "oss";
  return hasUsageEntitlementQuota(entitlement, plan, isViewOnly);
};
