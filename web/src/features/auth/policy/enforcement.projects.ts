import { type IncomingHttpHeaders } from "http";

import {
  ForbiddenError,
  type InternalServerError,
  InvalidRequestError,
  LangfuseNotFoundError,
  type UnauthorizedError,
} from "@langfuse/shared";
import { prisma, type PrismaClient } from "@langfuse/shared/src/db";
import {
  type ApiAccessLevel,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";

import { authorize } from "./authorize";
import { headerValue } from "./enforce";
import { type AuthenticatedCredential, authenticate } from "./identity";
import { accessLevelOf, adminScope, keyScope } from "./scope";
import {
  type AuthorizationContext,
  type ErrorResult,
  type PrincipalOrganization,
  type ProjectAction,
  type Success,
} from "./types";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "x-langfuse-project-id";

/** insufficientPermissions is the 403 legacy returned when a key's access level is not accepted by the route. */
const insufficientPermissions =
  "Access denied - insufficient permissions for this endpoint";

/** enforceProjectAuth runs the new project pipeline — authenticate, access-level gate, target resolution, authorize, scope — returning every outcome as a value; it never throws one. */
export async function enforceProjectAuth(
  params: EnforceProjectAuthParams,
): Promise<ProjectAccessResult | ErrorResult<AuthError>> {
  const authn = await authenticate({
    headers: params.headers,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
  if (!authn.success) return authn;

  const { context, credential } = authn;
  const gate = gateAccessLevel(credential, params.allowedAccessLevels);
  if (gate) return gate;

  const target = getProjectId(context, params.headers);
  if (!target.success) return target;

  if (params.action !== undefined) {
    const decision = authorize(context, params.action, {
      projectId: target.projectId,
    });
    if (!decision.success) return { success: false, error: decision.error };
  }

  const scope = await buildScope(
    credential,
    context,
    target.projectId,
    params.orgIdOfProject ?? defaultOrgIdOfProject,
  );
  if (!scope.success) return scope;
  return {
    success: true,
    context,
    projectId: target.projectId,
    scope: scope.scope,
  };
}

/** gateAccessLevel rejects a credential whose access level the route does not accept. */
function gateAccessLevel(
  credential: AuthenticatedCredential,
  allowed: ApiAccessLevel[] = ["project"],
): ErrorResult<ForbiddenError> | null {
  const level =
    credential.authorization === "adminKey"
      ? "project"
      : accessLevelOf(credential.authorization, credential.apiKey);
  if (allowed.includes(level)) return null;
  return { success: false, error: new ForbiddenError(insufficientPermissions) };
}

/** buildScope assembles the request's ApiAccessScope from its credential and resolved target. */
async function buildScope(
  credential: AuthenticatedCredential,
  context: AuthorizationContext,
  projectId: string,
  orgIdOfProject: OrgIdOfProject,
): Promise<ScopeResult> {
  if (credential.authorization === "adminKey") {
    const orgId = await orgIdOfProject(projectId);
    if (!orgId) {
      return {
        success: false,
        error: new LangfuseNotFoundError("Project not found"),
      };
    }
    return { success: true, scope: adminScope(projectId, orgId) };
  }
  const org = orgOf(context);
  if (!org) {
    return {
      success: false,
      error: new InvalidRequestError("No organization on principal"),
    };
  }
  return {
    success: true,
    scope: keyScope({
      apiKey: credential.apiKey,
      org,
      presentation: credential.authorization,
      projectId,
    }),
  };
}

/** getProjectId resolves the target project as `header ?? boundResource ?? 400`; a header disagreeing with the bound project 400s. */
function getProjectId(
  context: AuthorizationContext,
  headers: IncomingHttpHeaders,
): ResolvedProject | ErrorResult<InvalidRequestError> {
  const boundProjectId = boundProjectIdOf(context);
  const header = headerValue(headers[projectIdHeader]);
  if (header && boundProjectId && header !== boundProjectId) {
    return {
      success: false,
      error: new InvalidRequestError(
        `${projectIdHeader} disagrees with the API key's project`,
      ),
    };
  }
  const projectId = header ?? boundProjectId;
  if (!projectId) {
    return {
      success: false,
      error: new InvalidRequestError(
        `No project target: send ${projectIdHeader} or use a project-scoped API key`,
      ),
    };
  }
  return { success: true, projectId };
}

/** boundProjectIdOf returns the project an api key is bound to, when any. */
function boundProjectIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  const bound = context.principal.boundResource;
  return bound && "projectId" in bound ? bound.projectId : undefined;
}

/** orgOf returns the single organization an api-key principal carries, when any. */
function orgOf(
  context: AuthorizationContext,
): PrincipalOrganization | undefined {
  if (context.principal.kind === "admin") return undefined;
  return context.principal.organizations[0];
}

/** defaultOrgIdOfProject reads a project's owning org id from Postgres. */
async function defaultOrgIdOfProject(
  projectId: string,
  db: PrismaClient = prisma,
): Promise<string | null> {
  const project = await db.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { orgId: true },
  });
  return project?.orgId ?? null;
}

/** EnforceProjectAuthParams is the request headers, the checked action, the accepted access levels, and the route's key-kind opt-ins. */
export type EnforceProjectAuthParams = {
  headers: IncomingHttpHeaders;
  action?: ProjectAction;
  allowedAccessLevels?: ApiAccessLevel[];
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
  orgIdOfProject?: OrgIdOfProject;
};

/** ProjectAccessResult is the project seam's success outcome: the resolved context, target, and scope. */
export type ProjectAccessResult = Success & {
  context: AuthorizationContext;
  projectId: string;
  scope: ApiAccessScope;
};

/** AuthError is any typed failure the project pipeline surfaces. */
export type AuthError =
  | UnauthorizedError
  | InvalidRequestError
  | InternalServerError
  | LangfuseNotFoundError
  | ForbiddenError;

/** EnforceProjectAuthDecision is the project pipeline's outcome — `enforceProjectAuth`'s return. */
export type EnforceProjectAuthDecision = Awaited<
  ReturnType<typeof enforceProjectAuth>
>;

/** OrgIdOfProject resolves a project's owning org id — the Postgres-backed collaborator. */
export type OrgIdOfProject = (projectId: string) => Promise<string | null>;

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

/** ScopeResult is scope construction's outcome: the built scope, or the typed failure to surface. */
type ScopeResult =
  | (Success & { scope: ApiAccessScope })
  | ErrorResult<AuthError>;

/** __test exposes module-private helpers for the colocated unit test. */
export const __test = { getProjectId };
