import {
  roleAccessRights,
  type Scope,
} from "@/src/features/rbac/constants/organizationAccessRights";
import { type OrganizationRole } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";

type HasOrganizationAccessParams =
  | {
      role: OrganizationRole;
      scope: Scope;
      admin?: boolean; // prop user.admin
    }
  | {
      session: null | Session;
      organizationId: string;
      scope: Scope;
    };

/**
 * Check if user has access to the given scope, for use in TRPC resolvers
 * @throws TRPCError("UNAUTHORIZED") if user does not have access
 */
export const throwIfNoOrganizationAccess = (p: HasOrganizationAccessParams) => {
  if (!hasOrganizationAccess(p))
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Unauthorized, user does not have access to this resource or action",
    });
};

/**
 * React hook to check if user has access to the given scope
 * @returns true if user has access, false otherwise or while loading
 */
export const useHasOrganizationAccess = (p: {
  organizationId: string | undefined;
  scope: Scope;
}) => {
  const { scope, organizationId } = p;
  const session = useSession();

  if (!organizationId) return false;

  return hasOrganizationAccess({
    session: session.data,
    scope,
    organizationId,
  });
};

// For use in UI components as function, if session is already available
export function hasOrganizationAccess(p: HasOrganizationAccessParams): boolean {
  const isAdmin = "role" in p ? p.admin : p.session?.user?.admin;
  if (isAdmin) return true;

  const organizationRole: OrganizationRole | undefined =
    "role" in p
      ? p.role
      : p.session?.user?.organizations.find(
          (org) => org.id === p.organizationId,
        )?.role;
  if (organizationRole === undefined) return false;

  return roleAccessRights[organizationRole].includes(p.scope);
}
