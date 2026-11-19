import { TRPCError } from "@trpc/server";
import { type Role } from "@langfuse/shared";

import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import { ORGANIZATION_ROLE_TOO_HIGH_MESSAGE } from "@/src/features/rbac/constants/membershipErrorMessages";

// Record as it allows to type check that all roles are included
export function throwIfHigherRole({
  ownRole,
  role,
}: {
  ownRole: Role;
  role: Role;
}) {
  if (orderedRoles[ownRole] < orderedRoles[role]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ORGANIZATION_ROLE_TOO_HIGH_MESSAGE,
    });
  }
}
