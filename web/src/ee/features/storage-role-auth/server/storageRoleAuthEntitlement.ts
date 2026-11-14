import { type Plan } from "@langfuse/shared";
import { type Session } from "next-auth";

import { findSessionProjectOrganization } from "@/src/features/rbac/new/sessionAccessors";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

export function getSessionPlanForProject({
  session,
  projectId,
}: {
  session: Session;
  projectId: string;
}): Plan | null {
  return findSessionProjectOrganization(session, projectId)?.plan ?? null;
}

// Only the organization's plan grants IAM role auth; Langfuse admins get no bypass.
export function canSessionUseStorageRoleAuth(params: {
  session: Session;
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
