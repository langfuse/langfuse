import { type Plan } from "@langfuse/shared";
import { type Session } from "next-auth";

import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

// Only the organization's plan grants IAM role auth; Langfuse admins get no bypass.
export function canSessionUseStorageRoleAuth({
  sessionUser,
  projectId,
}: {
  sessionUser: NonNullable<Session["user"]>;
  projectId: string;
}) {
  const org = sessionUser.organizations.find((org) =>
    org.projects.some((project) => project.id === projectId),
  );
  return canPlanUseStorageRoleAuth(org?.plan ?? null);
}

export function canPlanUseStorageRoleAuth(plan: Plan | null) {
  return hasEntitlementBasedOnPlan({
    plan,
    entitlement: "storage-iam-role-auth",
  });
}
