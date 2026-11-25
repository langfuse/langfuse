import { ForbiddenError, type ProjectScope } from "@langfuse/shared";
import { ProjectId } from "@langfuse/shared/rbac";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { authorize } from "@/src/features/rbac/authorize";
import {
  forbiddenError,
  getTenantForProject,
  toAuthorizationContext,
  type AuthorizationContext,
  type Decision,
} from "@/src/features/auth/policy/types";

/** HasProjectAccessParams is a `ctx` (server code) or a next-auth `session` (client code), and the projectId whose policies decide scope. */
type HasProjectAccessParams = (
  | { ctx: AuthorizationContext; session?: never }
  | { session: Session | null; ctx?: never }
) & {
  projectId: string;
  scope: ProjectScope;
  forbiddenErrorMessage?: string;
};

/**
 * Check if user has access to the given scope, for use in TRPC resolvers
 * @throws ForbiddenError if user does not have access
 */
export const throwIfNoProjectAccess = (p: HasProjectAccessParams) => {
  const decision = authorizeProject(p);
  if (decision.success) return;
  if (p.forbiddenErrorMessage)
    throw new ForbiddenError(p.forbiddenErrorMessage);
  throw decision.error;
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

  if (!projectId) return false;

  return hasProjectAccess({ session: session.data, scope, projectId });
};

// For use in UI components as function, if session is already available
export function hasProjectAccess(p: HasProjectAccessParams): boolean {
  return authorizeProject(p).success;
}

/** authorizeProject decides scope on projectId within the tenant that owns it. */
function authorizeProject(p: HasProjectAccessParams): Decision {
  const ctx = p.ctx ?? toAuthorizationContext(p.session);
  const tenant = ctx && getTenantForProject(ctx, p.projectId);
  if (!ctx || !tenant) return forbiddenError();
  return authorize(ctx, tenant, p.scope, ProjectId(p.projectId));
}
