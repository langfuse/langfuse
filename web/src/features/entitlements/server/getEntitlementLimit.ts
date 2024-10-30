import {
  entitlementAccess,
  type EntitlementLimit,
} from "@/src/features/entitlements/constants/entitlements";
import { TRPCError } from "@trpc/server";
import { type User } from "next-auth";

type GetEntitlementLimitParams = {
  entitlementLimit: EntitlementLimit;
  sessionUser: User;
} & ({ projectId: string } | { orgId: string });

/**
 * Get the limit for a specific entitlement based on the session user (to be used server-side).
 * @returns false if unlimited, or a number representing the limit
 */
export const getEntitlementLimit = (
  p: GetEntitlementLimitParams,
): number | false => {
  if (p.sessionUser.admin) return false; // Admins have unlimited access

  const org =
    "projectId" in p
      ? p.sessionUser.organizations.find((org) =>
          org.projects.some((proj) => proj.id === p.projectId),
        )
      : p.sessionUser.organizations.find((org) => org.id === p.orgId);

  const plan = org?.plan ?? "oss";
  return entitlementAccess[plan].entitlementLimits[p.entitlementLimit];
};

/**
 * Check if a specific usage is within the entitlement limit
 * @returns true if usage is allowed, false if it exceeds the limit
 */
export const isWithinEntitlementLimit = (
  p: GetEntitlementLimitParams & { currentUsage: number },
): boolean => {
  const limit = getEntitlementLimit(p);
  if (limit === false) return true; // No limit
  return p.currentUsage < limit;
};

/**
 * Throws if usage exceeds the entitlement limit
 */
export const throwIfExceedsLimit = (
  p: GetEntitlementLimitParams & { currentUsage: number },
) => {
  if (!isWithinEntitlementLimit(p)) {
    const limit = getEntitlementLimit(p);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Usage (${p.currentUsage}) exceeds the limit (${limit}) for entitlement: ${p.entitlementLimit}`,
    });
  }
};
