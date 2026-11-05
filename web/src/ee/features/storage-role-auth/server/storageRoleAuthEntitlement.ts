import { type Plan } from "@langfuse/shared";
import { type Session } from "next-auth";

import {
  hasEntitlement,
  hasEntitlementBasedOnPlan,
} from "@/src/features/entitlements/server/hasEntitlement";

export function canSessionUseStorageRoleAuth({
  sessionUser,
  projectId,
}: {
  sessionUser: NonNullable<Session["user"]>;
  projectId: string;
}) {
  return Boolean(
    hasEntitlement({
      entitlement: "storage-iam-role-auth",
      sessionUser,
      projectId,
    }),
  );
}

export function canPlanUseStorageRoleAuth(plan: Plan) {
  return hasEntitlementBasedOnPlan({
    plan,
    entitlement: "storage-iam-role-auth",
  });
}
