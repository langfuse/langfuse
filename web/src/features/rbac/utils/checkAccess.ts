import {
  roleAccessRights,
  type Scope,
} from "@/src/features/rbac/constants/roleAccessRights";
import { type ProjectRole } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";

type HasAccessParams =
  | {
      role: ProjectRole;
      scope: Scope;
      admin?: boolean; // prop user.admin
    }
  | {
      session: null | Session;
      projectId: string;
      scope: Scope;
    };

/**
 * Check if user has access to the given scope, for use in TRPC resolvers
 * @throws TRPCError("UNAUTHORIZED") if user does not have access
 */
export const throwIfNoAccess = (p: HasAccessParams) => {
  if (!hasAccess(p))
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
export const useHasAccess = (p: {
  projectId: string | undefined;
  scope: Scope;
}) => {
  const { scope, projectId } = p;
  const session = useSession();

  if (!projectId) return false;

  return hasAccess({ session: session.data, scope, projectId });
};

// For use in UI components as function, if session is already available
export function hasAccess(p: HasAccessParams): boolean {
  const isAdmin = "role" in p ? p.admin : p.session?.user?.admin;
  if (isAdmin) return true;

  const projectRole: ProjectRole | undefined =
    "role" in p
      ? p.role
      : p.session?.user?.projects.find((project) => project.id === p.projectId)
          ?.role;
  if (projectRole === undefined) return false;

  return roleAccessRights[projectRole].includes(p.scope);
}
