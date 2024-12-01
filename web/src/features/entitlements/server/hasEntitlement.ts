import {
  entitlementAccess,
  type Entitlement,
} from "@/src/features/entitlements/constants/entitlements";
import { TRPCError } from "@trpc/server";
import { type User } from "next-auth";
import { type Plan } from "@langfuse/shared";

type HasEntitlementParams = {
  entitlement: Entitlement;
  sessionUser: User;
} & ({ projectId: string } | { orgId: string });

/**
 * Check if user has access to a specific entitlement based on the session user (to be used server-side).
 */
export const hasEntitlement = (p: HasEntitlementParams): Boolean => {
  if (p.sessionUser.admin) return true;
  const org =
    "projectId" in p
      ? p.sessionUser.organizations.find((org) =>
          org.projects.some((proj) => proj.id === p.projectId),
        )
      : p.sessionUser.organizations.find((org) => org.id === p.orgId);
  const plan = org?.plan ?? "oss";
  return hasEntitlementBasedOnPlan({ plan, entitlement: p.entitlement });
};

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

export const throwIfNoEntitlement = (p: HasEntitlementParams) => {
  if (!hasEntitlement(p)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Unauthorized, user does not have access to entitlement: " +
        p.entitlement,
    });
  }
};
