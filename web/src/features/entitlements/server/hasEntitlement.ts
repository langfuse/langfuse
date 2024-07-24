import {
  entitlementAccess,
  type Entitlement,
} from "@/src/features/entitlements/constants/entitlements";
import { type User } from "next-auth";

/**
 * Check if user has access to a specific entitlement based on the session user (to be used server-side).
 */
export const hasEntitlement = (
  p: {
    entitlement: Entitlement;
    sessionUser: User;
  } & ({ projectId: string } | { orgId: string }),
): Boolean => {
  const org =
    "projectId" in p
      ? p.sessionUser.organizations.find((org) =>
          org.projects.some((proj) => proj.id === p.projectId),
        )
      : p.sessionUser.organizations.find((org) => org.id === p.orgId);
  const plan = org?.plan ?? "oss";
  const availableEntitlements = entitlementAccess[plan];
  return availableEntitlements.includes(p.entitlement);
};
