import { TRPCError } from "@trpc/server";

import { projectRoleAccessRights, type ProjectScope } from "@langfuse/shared";
import { OrganizationId, ProjectId } from "@langfuse/shared/rbac";
import { type Role } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import { INTERNAL_FEATURE_FLAG } from "@/src/features/feature-flags/available-flags";
import { hasInternalAccess } from "@/src/features/feature-flags/utils";
import { authorize } from "@/src/features/rbac/authorize";
import { hasOwnRole } from "@/src/features/rbac/utils/hasOwnRole";
import {
  findPrincipalProjectOrganization,
  getPrincipalUser,
  getSessionEnvironment,
  type MaybeSession,
} from "./sessionAccessors";

/** demoProjectLlmScopes are the LLM operations the demo project allows only in the internal view. */
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

/** hasProjectAccess reports whether the role, or the session's policies on projectId, grant scope. */
export function hasProjectAccess(p: HasProjectAccessParams): boolean {
  if (hasOwnRole(p)) return projectRoleAccessRights[p.role].includes(p.scope);
  if (isDemoProjectLlmRestricted(p)) return false;
  return isAuthorizedOnProject(p);
}

/** throwIfNoProjectAccess throws a tRPC FORBIDDEN error, with the caller's message if given, when hasProjectAccess denies. */
export function throwIfNoProjectAccess(p: HasProjectAccessParams): void {
  if (hasProjectAccess(p)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      p.forbiddenErrorMessage ??
      "User does not have access to this resource or action",
  });
}

/** isDemoProjectLlmRestricted reports whether scope is an LLM operation on the demo project the user may not run outside the internal view. */
function isDemoProjectLlmRestricted({
  session,
  projectId,
  scope,
}: SessionProjectAccessParams): boolean {
  return (
    projectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
    demoProjectLlmScopes.has(scope) &&
    !isInternalViewEnabled(session)
  );
}

/** isInternalViewEnabled reports whether the user has internal access and has not switched the internal view off. */
function isInternalViewEnabled(session: MaybeSession): boolean {
  const user = getPrincipalUser(session);
  return (
    hasInternalAccess({
      email: user?.email,
      isExperimentalFeaturesEnabled:
        getSessionEnvironment(session)?.enableExperimentalFeatures === true,
    }) && user?.featureFlags[INTERNAL_FEATURE_FLAG] !== false
  );
}

/** isAuthorizedOnProject authorizes scope on a project the session lists among its live projects. */
function isAuthorizedOnProject({
  session,
  projectId,
  scope,
}: SessionProjectAccessParams): boolean {
  const org = findPrincipalProjectOrganization(session, projectId);
  if (!org || !session?.authCtx) return false;
  return authorize(
    session.authCtx,
    OrganizationId(org.id),
    scope,
    ProjectId(projectId),
  ).success;
}

/** HasProjectAccessParams is an explicit role, or a session and the projectId whose policies decide scope. */
type HasProjectAccessParams = (
  | { role: Role; scope: ProjectScope }
  | SessionProjectAccessParams
) & { forbiddenErrorMessage?: string };

/** SessionProjectAccessParams is a session and the projectId whose policies decide scope. */
type SessionProjectAccessParams = {
  session: MaybeSession;
  projectId: string;
  scope: ProjectScope;
};
