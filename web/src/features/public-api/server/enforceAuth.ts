import { type NextApiRequest } from "next";

import {
  type ForbiddenError,
  type InternalServerError,
  type LangfuseNotFoundError,
  type UnauthorizedError,
} from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { authorize } from "@/src/features/auth/policy/authorize";
import { authenticator } from "@/src/features/apiKey/authenticator";
import { toApiAccessScope } from "@/src/features/public-api/server/toApiAccessScope";
import {
  forbiddenError,
  internalServerError,
  isOrgAction,
  notFoundError,
  type Action,
  type AuthorizationContext,
  type Decision,
  type ErrorResult,
  type Principal,
  type Resource,
  type Success,
} from "@/src/features/auth/policy/types";

/** orgIdHeader selects the target org. */
const orgIdHeader = "x-langfuse-organization-id";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "x-langfuse-project-id";

/** enforceAuth authenticates the request and authorizes the action for the given endpoint (combines authz and authn). */
export async function enforceAuth({
  req,
  action,
  allowInAppAgentKey,
  isAdminApiKeyAuthAllowed,
}: EnforceAuthParams): Promise<EnforceAuthResult> {
  const auth = await authenticator.authenticate({
    headers: req.headers,
    allowInAppAgentKey: allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: isAdminApiKeyAuthAllowed,
  });
  if (!auth.success) return auth;

  const { context } = auth;
  switch (context.principal.kind) {
    case "admin":
      return enforceAdminAuth(context, req, action);
    case "apiKey":
      return action !== undefined && isOrgAction(action)
        ? enforceOrgAuth(context, req, action)
        : enforceProjectAuth(context, req, action);
    default:
      return internalServerError(`Unexpected principal on the public api`);
  }
}

/** enforceAdminAuth resolves, authorizes, and scopes a self-host admin-key request against its target project; the authenticator admits admin keys only on opted-in, non-Cloud routes. */
async function enforceAdminAuth(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: Action | undefined,
): Promise<EnforceAuthResult> {
  const projectId = getHeaderProjectId(req);
  if (!projectId) return forbiddenError(`Missing '${projectIdHeader}' header`);

  const org = await lookupProjectOrgId(projectId);
  if (!org.success) return org;

  const decision = authorizeAction(context, action, { projectId });
  if (!decision.success) return decision;

  return access(context, org.orgId, projectId);
}

/** enforceOrgAuth resolves, authorizes, and scopes an organization-scoped api-key request. */
function enforceOrgAuth(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: Action | undefined,
): EnforceAuthResult {
  const org = getOrgId(context, req);
  if (!org.success) return org;

  const decision = authorizeAction(context, action, { orgId: org.orgId });
  if (!decision.success) return decision;

  return access(context, org.orgId);
}

/** enforceProjectAuth resolves, authorizes, and scopes a project-scoped api-key request against its bound org; an organization key naming a project outside its org is told the project does not exist, as the route handlers do. */
function enforceProjectAuth(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: Action | undefined,
): EnforceAuthResult {
  const project = getProjectId(context, req);
  if (!project.success) return project;

  if (!ownsProject(context.principal, project.projectId)) {
    return notFoundError("Project not found or you don't have access to it");
  }

  const decision = authorizeAction(context, action, {
    projectId: project.projectId,
  });
  if (!decision.success) return decision;

  const orgId = getBoundOrgId(context);
  if (!orgId) return internalServerError(`Missing bound org on api-key`);

  return access(context, orgId, project.projectId);
}

/** authorizeAction authorizes against a given action, or passes when the route asserts none and authorizes each item itself. */
function authorizeAction(
  context: AuthorizationContext,
  action: Action | undefined,
  resource: Resource,
): Decision {
  if (action === undefined) return { success: true };
  return authorize(context, action, resource);
}

/** getOrgId resolves the target org the key's bound org and the header agree on. */
function getOrgId(
  context: AuthorizationContext,
  req: NextApiRequest,
): ResolvedOrg | ErrorResult<ForbiddenError> {
  const requested = [getHeaderOrgId(req), getBoundOrgId(context)];
  const orgId = first(requested);
  if (!equal(requested) || !orgId) {
    return forbiddenError();
  }

  return { success: true, orgId };
}

/** getProjectId resolves the target project the key's bound project, the URL param, and the header agree on. */
function getProjectId(
  context: AuthorizationContext,
  req: NextApiRequest,
): ResolvedProject | ErrorResult<ForbiddenError> {
  const requested = [
    getBoundProjectId(context),
    getUrlProjectId(req),
    getHeaderProjectId(req),
  ];

  const projectId = first(requested);
  if (!equal(requested) || !projectId) {
    return forbiddenError();
  }

  return { success: true, projectId };
}

/** lookupProjectOrgId reads a project's org from the database, 404ing when the project is absent. */
async function lookupProjectOrgId(
  projectId: string,
): Promise<ResolvedOrg | ErrorResult<LangfuseNotFoundError>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { orgId: true },
  });
  if (!project) {
    return notFoundError("Project not found");
  }
  return { success: true, orgId: project.orgId };
}

/** ownsProject reports whether the project belongs to one of the key's organizations. */
const ownsProject = (principal: Principal, projectId: string) =>
  "organizations" in principal &&
  principal.organizations.some((o) => o.projectIds.includes(projectId));

/** getBoundOrgId returns the org an api key is bound to. */
function getBoundOrgId(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  return context.principal.boundResource.orgId;
}

/** getBoundProjectId returns the project an api key is bound to, when it is project-scoped. */
function getBoundProjectId(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  return context.principal.boundResource.projectId;
}

/** getHeaderOrgId returns the target org from the header. */
function getHeaderOrgId(req: NextApiRequest): string | undefined {
  return getHeaderValue(req.headers[orgIdHeader]) || undefined;
}

/** getHeaderProjectId returns the target project from the header. */
function getHeaderProjectId(req: NextApiRequest): string | undefined {
  return getHeaderValue(req.headers[projectIdHeader]) || undefined;
}

/** getUrlProjectId returns the target project from the URL param. */
function getUrlProjectId(req: NextApiRequest): string | undefined {
  return typeof req.query.projectId === "string"
    ? req.query.projectId
    : undefined;
}

/** getHeaderValue normalizes a possibly-repeated header to its first value. */
const getHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/** equal returns true when every defined value agrees. */
function equal(os: (string | undefined)[]): boolean {
  let prev: string | undefined;
  for (const o of os) {
    if (prev && o && prev !== o) return false;
    if (o) prev = o;
  }
  return true;
}

/** first returns the first defined value. */
function first(os: (string | undefined)[]): string | undefined {
  return os.find((o) => o !== undefined);
}

/** access is returned when the enforceAuth grants access */
function access(
  context: AuthorizationContext,
  orgId: string,
  projectId?: string,
): AccessResult {
  return {
    success: true,
    scope: toApiAccessScope(context.principal, {
      orgId: orgId,
      projectId: projectId ?? null,
    }),
    ctx: context,
  };
}

/** EnforceAuthParams is the request, the optional connection action, and the request's key-kind opt-ins; omit the action to resolve context without a connection-level check. */
export type EnforceAuthParams = {
  req: NextApiRequest;
  action?: Action;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** AccessResult is the seam's success outcome: the resolved ApiAccessScope and the context that authorized it. */
type AccessResult = Success & {
  scope: ApiAccessScope;
  ctx: AuthorizationContext;
};

/** EnforceAuthResult is the authorized scope, or the typed error the route renders. */
export type EnforceAuthResult =
  | AccessResult
  | ErrorResult<
      | UnauthorizedError
      | InternalServerError
      | ForbiddenError
      | LangfuseNotFoundError
    >;

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

export const __test = {
  getOrgId,
  getProjectId,
};
