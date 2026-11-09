import { TRPCError } from "@trpc/server";
import { type Role } from "@langfuse/shared";
import {
  organizationRoleAccessRights,
  type OrganizationScope,
} from "@langfuse/shared/rbac";

import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

/** The session's org scopes (role + groups), if any group applies. */
export function sessionOrganizationScopes(session: {
  orgId: string;
  user: { organizations: { id: string; scopes?: OrganizationScope[] }[] };
}): OrganizationScope[] | undefined {
  return session.user.organizations.find((org) => org.id === session.orgId)
    ?.scopes;
}

/** Throws unless `ownRole` ranks at least as high as `role`, or `ownScopes` cover it. */
export function throwIfHigherRole({
  ownRole,
  ownScopes,
  role,
}: {
  ownRole: Role;
  ownScopes?: OrganizationScope[];
  role: Role;
}) {
  if (orderedRoles[ownRole] >= orderedRoles[role]) return;
  if (
    ownScopes &&
    organizationRoleAccessRights[role].every((scope) =>
      ownScopes.includes(scope),
    )
  ) {
    return;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You cannot grant/edit a role higher than your own",
  });
}
