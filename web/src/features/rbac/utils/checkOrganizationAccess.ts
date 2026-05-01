import {
  organizationRoleAccessRights,
  type OrganizationScope,
} from "@/src/features/rbac/constants/organizationAccessRights";
import { type Role } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { hasOwnRole } from "./hasOwnRole";

type HasOrganizationAccessParams =
  | {
      role: Role;
      scope: OrganizationScope;
      admin?: boolean; // prop user.admin
    }
  | {
      session: null | Session;
      organizationId: string;
      scope: OrganizationScope;
    };

/**
 * Check if user has access to the given scope, for use in TRPC resolvers
 * @throws TRPCError("FORBIDDEN") if user does not have access
 */
export const throwIfNoOrganizationAccess = (p: HasOrganizationAccessParams) => {
  if (!hasOrganizationAccess(p))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Forbidden, user does not have access to this resource or action",
    });
};

/**
 * React hook to check if user has access to the given scope
 * @returns true if user has access, false otherwise or while loading
 */
export const useHasOrganizationAccess = (p: {
  organizationId: string | undefined;
  scope: OrganizationScope;
}) => {
  const { scope, organizationId } = p;
  const session = useSession();

  if (session.data?.user?.admin) return true;
  if (!organizationId) return false;

  return hasOrganizationAccess({
    session: session.data,
    scope,
    organizationId,
  });
};

// For use in UI components as function, if session is already available
export function hasOrganizationAccess(p: HasOrganizationAccessParams): boolean {
  const isAdmin = hasOwnRole(p) ? p.admin : p.session?.user?.admin;
  if (isAdmin) return true;

  const organizationRole: Role | undefined = hasOwnRole(p)
    ? p.role
    : p.session?.user?.organizations.find((org) => org.id === p.organizationId)
        ?.role;
  if (organizationRole === undefined) return false;

  return organizationRoleAccessRights[organizationRole].includes(p.scope);
}
