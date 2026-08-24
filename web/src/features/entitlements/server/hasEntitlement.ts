import {
  entitlementAccess,
  type Entitlement,
} from "@/src/features/entitlements/constants/entitlements";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { type Plan } from "@langfuse/shared";
// PROTOTYPE(LFE-15038): entitlement checks also accept the new path's context
import {
  type AuthorizationContext,
  type Resource,
} from "@/src/features/auth/policy/policy.prototype";

type HasEntitlementParams = {
  entitlement: Entitlement;
  sessionUser: NonNullable<Session["user"]>;
} & ({ projectId: string } | { orgId: string });

/** HasEntitlementPolicyParams resolves the plan from the AuthorizationContext's org covering the resource. */
type HasEntitlementPolicyParams = {
  entitlement: Entitlement;
  context: AuthorizationContext;
} & Resource;

/**
 * Check if user has access to a specific entitlement based on the session user (to be used server-side).
 */
export function hasEntitlement(
  p: HasEntitlementParams | HasEntitlementPolicyParams,
): boolean {
  if ("context" in p) {
    return hasEntitlementFromContext(p);
  }
  return hasEntitlementFromSession(p);
}

/** hasEntitlementFromContext checks the entitlement against the plan of the context's org covering the resource; admins are always entitled. */
function hasEntitlementFromContext(p: HasEntitlementPolicyParams): boolean {
  if (p.context.principal.kind === "admin") {
    return true;
  }
  const org = p.context.principal.organizations.find((o) => {
    if ("orgId" in p) {
      return o.orgId === p.orgId;
    }
    return o.projectIds.includes(p.projectId);
  });
  const plan = org?.plan ?? "oss";
  return hasEntitlementBasedOnPlan({ plan, entitlement: p.entitlement });
}

/** hasEntitlementFromSession checks the entitlement against the plan of the session org owning the target; admins are always entitled. */
function hasEntitlementFromSession(p: HasEntitlementParams): boolean {
  if (p.sessionUser.admin) return true;
  const org =
    "projectId" in p
      ? p.sessionUser.organizations.find((org) =>
          org.projects.some((proj) => proj.id === p.projectId),
        )
      : p.sessionUser.organizations.find((org) => org.id === p.orgId);
  const plan = org?.plan ?? "oss";
  return hasEntitlementBasedOnPlan({ plan, entitlement: p.entitlement });
}

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
