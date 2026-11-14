/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  entitlementAccess,
  type Entitlement,
} from "@/src/features/entitlements/constants/entitlements";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { type Plan } from "@langfuse/shared";
import {
  findSessionOrganization,
  findSessionProjectOrganization,
} from "@/src/features/auth/lib/sessionAccessors";

type HasEntitlementParams = {
  entitlement: Entitlement;
  session: Session;
} & ({ projectId: string } | { orgId: string });

/**
 * Check if user has access to a specific entitlement based on the session user (to be used server-side).
 */
export const hasEntitlement = (p: HasEntitlementParams): Boolean => {
  const org =
    "projectId" in p
      ? findSessionProjectOrganization(p.session, p.projectId)
      : findSessionOrganization(p.session, p.orgId);
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
