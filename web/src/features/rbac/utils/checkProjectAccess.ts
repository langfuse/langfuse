import { projectRoleAccessRights, type ProjectScope } from "@langfuse/shared";
import { type Role } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { hasOwnRole } from "./hasOwnRole";
import { env } from "@/src/env.mjs";

/** LLM execution scopes require an internal admin in the demo project. */
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

  if (session.data?.user?.admin) return true;
  if (!projectId) return false;

  return hasProjectAccess({ session: session.data, scope, projectId });
};

// For use in UI components as function, if session is already available
export function hasProjectAccess(p: HasProjectAccessParams): boolean {
  const isAdmin = hasOwnRole(p) ? p.admin : p.session?.user?.admin;
  if (isAdmin) return true;

  if (isDemoProjectLlmScope(p)) return false;

  const projectRole: Role | undefined = hasOwnRole(p)
    ? p.role
    : p.session?.user?.organizations
        .flatMap((org) => org.projects)
        .find((project) => project.id === p.projectId)?.role;
  if (projectRole === undefined) return false;

  return projectRoleAccessRights[projectRole].includes(p.scope);
}

function isDemoProjectLlmScope(p: HasProjectAccessParams): boolean {
  return (
    !hasOwnRole(p) &&
    p.projectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
    demoProjectLlmScopes.has(p.scope)
  );
}
