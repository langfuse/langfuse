import { ForbiddenError } from "@langfuse/shared";
import { OrganizationId, type OrganizationScope } from "@langfuse/shared/rbac";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { authorize } from "@/src/features/rbac/authorize";
import {
  forbiddenError,
  toAuthorizationContext,
  type AuthorizationContext,
  type Decision,
} from "@/src/features/auth/policy/types";

/** HasOrganizationAccessParams is a `ctx` (server code) or a next-auth `session` (client code), and the organizationId whose policies decide scope. */
type HasOrganizationAccessParams = (
  | { ctx: AuthorizationContext; session?: never }
  | { session: Session | null; ctx?: never }
) & {
  organizationId: string;
  scope: OrganizationScope;
  forbiddenErrorMessage?: string;
};

/**
 * Check if user has access to the given scope, for use in TRPC resolvers
 * @throws ForbiddenError if user does not have access
 */
export const throwIfNoOrganizationAccess = (p: HasOrganizationAccessParams) => {
  const decision = authorizeOrganization(p);
  if (decision.success) return;
  if (p.forbiddenErrorMessage)
    throw new ForbiddenError(p.forbiddenErrorMessage);
  throw decision.error;
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

  if (!organizationId) return false;

  return hasOrganizationAccess({
    session: session.data,
    scope,
    organizationId,
  });
};

// For use in UI components as function, if session is already available
export function hasOrganizationAccess(p: HasOrganizationAccessParams): boolean {
  return authorizeOrganization(p).success;
}

/** authorizeOrganization decides scope on the organization, its own tenant. */
function authorizeOrganization(p: HasOrganizationAccessParams): Decision {
  const ctx = p.ctx ?? toAuthorizationContext(p.session);
  if (!ctx) return forbiddenError();
  const organization = OrganizationId(p.organizationId);
  return authorize(ctx, organization, p.scope, organization);
}
