import { projectRoleAccessRights, type ProjectScope } from "@langfuse/shared";
import { type Role } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
// PROTOTYPE(LFE-15038): policy-core overload, proven unambiguous by typecheck
import {
  authorize,
  type AuthorizationContext,
  type ProjectAction,
} from "@/src/features/auth/policy/policy.prototype";
import { hasOwnRole } from "./hasOwnRole";

type HasProjectAccessParams = (
  | {
      role: Role;
      scope: ProjectScope;
      admin?: boolean; // prop user.admin
    }
  | {
      session: null | Session;
      projectId: string;
      scope: ProjectScope;
    }
) & { forbiddenErrorMessage?: string };

/**
 * Check if user has access to the given scope, for use in TRPC resolvers
 * @throws TRPCError("FORBIDDEN") if user does not have access
 */
export function throwIfNoProjectAccess(p: HasProjectAccessParams): void;
export function throwIfNoProjectAccess(p: PolicyProjectAccessParams): void;
export function throwIfNoProjectAccess(
  p: HasProjectAccessParams | PolicyProjectAccessParams,
): void {
  if ("context" in p) {
    const decision = authorize(p.context, p.action, { projectId: p.projectId });
    if (!decision.success) throw decision.error;
    return;
  }
  if (!hasProjectAccess(p))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        p.forbiddenErrorMessage ??
        "User does not have access to this resource or action",
    });
}

/** PolicyProjectAccessParams is the policy-core call shape the RFC adds beside the session shape. */
type PolicyProjectAccessParams = {
  context: AuthorizationContext;
  projectId: string;
  action: ProjectAction;
};

/**
 * React hook to check if user has access to the given scope
 * @returns true if user has access, false otherwise or while loading
 */
export const useHasProjectAccess = (p: {
  projectId: string | undefined;
  scope: ProjectScope;
}) => {
  const { scope, projectId } = p;
  const session = useSession();

  if (session.data?.user?.admin) return true;
  if (!projectId) return false;

  return hasProjectAccess({ session: session.data, scope, projectId });
};

// For use in UI components as function, if session is already available
export function hasProjectAccess(p: HasProjectAccessParams): boolean {
  const isAdmin = hasOwnRole(p) ? p.admin : p.session?.user?.admin;
  if (isAdmin) return true;

  const projectRole: Role | undefined = hasOwnRole(p)
    ? p.role
    : p.session?.user?.organizations
        .flatMap((org) => org.projects)
        .find((project) => project.id === p.projectId)?.role;
  if (projectRole === undefined) return false;

  return projectRoleAccessRights[projectRole].includes(p.scope);
}
