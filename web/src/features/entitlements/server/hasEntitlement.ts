import {
  entitlementAccess,
  type Entitlement,
} from "@/src/features/entitlements/constants/entitlements";
import { type User } from "next-auth";

/**
 * Check if user has access to a specific entitlement based on the session user (to be used server-side).
 */
export const hasEntitlement = (p: {
  entitlement: Entitlement;
  projectId: string;
  sessionUser: User;
}): Boolean => {
  const org = p.sessionUser.organizations.find((org) =>
    org.projects.some((proj) => proj.id === p.projectId),
  );
  const plan = org?.plan ?? "oss";
  const availableEntitlements = entitlementAccess[plan];
  return availableEntitlements.includes(p.entitlement);
};
