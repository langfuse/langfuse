import { type ProjectScope } from "@langfuse/shared";
import { OrganizationId, ProjectId } from "@langfuse/shared/rbac";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import { isInternalViewEnabled } from "@/src/features/feature-flags/utils";
import { authorize } from "@/src/features/rbac/authorize";

/** Demo LLM operations need Internal view and project permissions. */
const demoProjectLlmScopes = new Set<ProjectScope>([
  "playground:execute",
  "topics:CUD",
  "evaluator:CUD",
  "evaluationRule:CUD",
  "promptExperiments:CUD",
  "evalDefaultModel:CUD",
  "llmApiKeys:create",
  "llmApiKeys:update",
]);

/** HasProjectAccessParams is a session and the projectId whose policies decide scope. */
type HasProjectAccessParams = {
  session: null | Session;
  projectId: string;
  scope: ProjectScope;
  forbiddenErrorMessage?: string;
};

/**
 * Check if user has access to the given scope, for use in TRPC resolvers
 * @throws TRPCError("FORBIDDEN") if user does not have access
 */
export const throwIfNoProjectAccess = (p: HasProjectAccessParams) => {
  if (!hasProjectAccess(p))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        p.forbiddenErrorMessage ??
        "User does not have access to this resource or action",
    });
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
  if (isDemoProjectLlmRestricted(p)) return false;
  const { session, projectId, scope } = p;
  const org = getOrganization(session, projectId);
  if (!session || !org) return false;
  return authorize(session, OrganizationId(org.id), scope, ProjectId(projectId))
    .success;
}

/** getOrganization finds the session's organization that lists projectId. */
function getOrganization(session: Session | null, projectId: string) {
  return session?.user?.organizations.find((org) =>
    org.projects.some((project) => project.id === projectId),
  );
}

/** isDemoProjectLlmRestricted reports whether scope is an LLM operation on the demo project the user may not run outside the internal view. */
function isDemoProjectLlmRestricted(p: HasProjectAccessParams): boolean {
  return (
    p.projectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
    demoProjectLlmScopes.has(p.scope) &&
    !isInternalViewEnabled(p.session)
  );
}
