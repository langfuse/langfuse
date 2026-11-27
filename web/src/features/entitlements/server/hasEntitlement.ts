import { hasEntitlementBasedOnPlan, type Entitlement } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";

type EntitlementTarget = {
  sessionUser: NonNullable<Session["user"]>;
} & ({ projectId: string } | { orgId: string });

type HasEntitlementParams = EntitlementTarget & { entitlement: Entitlement };

/**
 * Check if user has access to a specific entitlement based on the session user (to be used server-side).
 */
export const hasEntitlement = (p: HasEntitlementParams): Boolean => {
  const org =
    "projectId" in p
      ? p.sessionUser.organizations.find((org) =>
          org.projects.some((proj) => proj.id === p.projectId),
        )
      : p.sessionUser.organizations.find((org) => org.id === p.orgId);
  const plan = org?.plan ?? "oss";
  return hasEntitlementBasedOnPlan({ plan, entitlement: p.entitlement });
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

export const throwIfNoEntitlements = ({
  entitlements,
  ...access
}: EntitlementTarget & { entitlements: Entitlement[] }) => {
  const missing = entitlements.filter(
    (entitlement) => !hasEntitlement({ ...access, entitlement }),
  );
  if (missing.length > 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Unauthorized, user does not have access to entitlements: " +
        missing.join(", "),
    });
  }
};
