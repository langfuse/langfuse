import {
  OrganizationId,
  organizationRoleAccessRights,
  type OrganizationScope,
} from "@langfuse/shared/rbac";
import { type Role } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";

import { authorize } from "@/src/features/rbac/authorize";
import { hasOwnRole } from "@/src/features/rbac/utils/hasOwnRole";
import { type MaybeSession } from "./sessionAccessors";

/** hasOrganizationAccess reports whether the role, or the session's policies on organizationId, grant scope. */
export function hasOrganizationAccess(p: HasOrganizationAccessParams): boolean {
  if (hasOwnRole(p)) {
    return organizationRoleAccessRights[p.role].includes(p.scope);
  }
  if (!p.session?.authCtx) return false;
  const organization = OrganizationId(p.organizationId);
  return authorize(p.session.authCtx, organization, p.scope, organization)
    .success;
}

/** throwIfNoOrganizationAccess throws a tRPC FORBIDDEN error when hasOrganizationAccess denies. */
export function throwIfNoOrganizationAccess(
  p: HasOrganizationAccessParams,
): void {
  if (hasOrganizationAccess(p)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Forbidden, user does not have access to this resource or action",
  });
}

/** HasOrganizationAccessParams is an explicit role, or a session and the organizationId whose policies decide scope. */
type HasOrganizationAccessParams =
  | { role: Role; scope: OrganizationScope }
  | { session: MaybeSession; organizationId: string; scope: OrganizationScope };
