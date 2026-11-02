import { TRPCError } from "@trpc/server";
import { type Role } from "@langfuse/shared";

import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

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
      message: "You cannot grant/edit a role higher than your own",
    });
  }
}
