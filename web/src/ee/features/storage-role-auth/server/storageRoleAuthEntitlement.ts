import { type Plan } from "@langfuse/shared";
import { type Session } from "next-auth";

import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

export function getSessionPlanForProject({
  sessionUser,
  projectId,
}: {
  sessionUser: NonNullable<Session["user"]>;
  projectId: string;
}): Plan | null {
  const org = sessionUser.organizations.find((org) =>
    org.projects.some((project) => project.id === projectId),
  );
  return org?.plan ?? null;
}

// Only the organization's plan grants IAM role auth; Langfuse admins get no bypass.
export function canSessionUseStorageRoleAuth(params: {
  sessionUser: NonNullable<Session["user"]>;
  projectId: string;
}) {
  return canPlanUseStorageRoleAuth(getSessionPlanForProject(params));
}

export function canPlanUseStorageRoleAuth(plan: Plan | null) {
  return hasEntitlementBasedOnPlan({
    plan,
    entitlement: "storage-iam-role-auth",
  });
}
