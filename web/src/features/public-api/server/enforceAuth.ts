import { type NextApiRequest } from "next";
import { type Span } from "@opentelemetry/api";

import {
  type ForbiddenError,
  type InternalServerError,
  type LangfuseNotFoundError,
  type ServiceUnavailableError,
  type UnauthorizedError,
} from "@langfuse/shared";
import {
  addUserToSpan,
  instrumentAsync,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  isOrgAction,
  OrganizationId,
  ProjectId,
  type Action,
  type ResourceId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { authorize } from "@/src/features/rbac/authorize";
import { authenticator } from "@/src/features/apiKey/server";
import { toApiAccessScope } from "@/src/features/public-api/server/toApiAccessScope";
import {
  forbiddenError,
  internalServerError,
  notFoundError,
  type AuthorizationContext,
  type Decision,
  type ErrorResult,
  type Principal,
  type Success,
} from "@/src/features/auth/policy/types";

/** __dangerouslySkipAuthz skips the connection-level action check for routes that authorize each call themselves. */
export const __dangerouslySkipAuthz = "__dangerouslySkipAuthz" as const;

/** orgIdHeader selects the target org. */
const orgIdHeader = "langfuse-organization-id";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "langfuse-project-id";

/** enforceAuth authenticates the request and authorizes the action for the given endpoint, or only resolves context when the route skips authz (combines authz and authn). */
export async function enforceAuth({
  req,
  action,
  allowInAppAgentKey,
  isAdminApiKeyAuthAllowed,
}: EnforceAuthParams): Promise<EnforceAuthResult> {
  return instrumentAsync({ name: "api-auth-enforce" }, async (span) => {
    span.setAttribute("langfuse.authz.action", action);
    const auth = await authenticator.authenticate({
      headers: req.headers,
      allowInAppAgentKey: allowInAppAgentKey,
      isAdminApiKeyAuthAllowed: isAdminApiKeyAuthAllowed,
    });
    if (!auth.success) return auth;

    const { context } = auth;
    switch (context.principal.kind) {
      case "admin":
        return enforceAdminAuthz(context, req, action, span);
      case "apiKey":
        return enforceApiKeyAuthz(context, req, action, span);
      default:
        return internalServerError(`Unexpected principal on the public api`);
    }
  });
}

/** enforceAdminAuthz resolves, authorizes, and scopes a self-host admin-key request against its target project; the authenticator admits admin keys only on opted-in, non-Cloud routes. */
async function enforceAdminAuthz(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: ApiAction,
  span: Span,
): Promise<EnforceAuthResult> {
  const projectId = getHeaderProjectId(req);
  if (!projectId) return forbiddenError(`Missing '${projectIdHeader}' header`);
  addUserToSpan({ projectId }, span);

  const org = await lookupProjectOrgId(projectId);
  if (!org.success) return org;
  addUserToSpan({ orgId: org.orgId }, span);

  const decision = authorizeAction(
    context,
    OrganizationId(org.orgId),
    action,
    ProjectId(projectId),
  );
  if (!decision.success) return decision;

  return access(context, org.orgId, projectId);
}

/** enforceApiKeyAuthz records key metadata and dispatches authorization by action scope. */
function enforceApiKeyAuthz(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: ApiAction,
  span: Span,
): EnforceAuthResult {
  if (context.principal.kind !== "apiKey") {
    return internalServerError(`Unexpected principal on the public api`);
  }
  const { apiKeyId, publicKey } = context.principal;
  addUserToSpan({ apiKeyId, publicKey }, span);
  if (action !== __dangerouslySkipAuthz && isOrgAction(action)) {
    return enforceOrgAuthz(context, req, action, span);
  }
  return enforceProjectAuthz(context, req, action, span);
}

/** enforceOrgAuthz resolves, authorizes, and scopes an organization-scoped api-key request. */
function enforceOrgAuthz(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: ApiAction,
  span: Span,
): EnforceAuthResult {
  const org = getOrgId(context, req);
  if (!org.success) return org;
  addUserToSpan({ orgId: org.orgId }, span);

  const decision = authorizeAction(
    context,
    OrganizationId(org.orgId),
    action,
    OrganizationId(org.orgId),
  );
  if (!decision.success) return decision;

  return access(context, org.orgId);
}

/** enforceProjectAuthz resolves, authorizes, and scopes a project-scoped api-key request against its bound org; an organization key naming a project outside its org is told the project does not exist, as the route handlers do. */
function enforceProjectAuthz(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: ApiAction,
  span: Span,
): EnforceAuthResult {
  const project = getProjectId(context, req);
  if (!project.success) return project;
  addUserToSpan({ projectId: project.projectId }, span);

  if (!ownsProject(context.principal, project.projectId)) {
    return notFoundError("Project not found or you don't have access to it");
  }

  const orgId = getBoundOrgId(context);
  if (!orgId) return internalServerError(`Missing bound org on api-key`);
  addUserToSpan({ orgId }, span);

  const decision = authorizeAction(
    context,
    OrganizationId(orgId),
    action,
    ProjectId(project.projectId),
  );
  if (!decision.success) return decision;

  return access(context, orgId, project.projectId);
}

/** authorizeAction authorizes against a given action within a tenant, or passes when the route skips authz and authorizes each call itself. */
function authorizeAction(
  context: AuthorizationContext,
  tenant: TenantId,
  action: ApiAction,
  resource: ResourceId,
): Decision {
  if (action === __dangerouslySkipAuthz) return { success: true };
  return authorize(context, tenant, action, resource);
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

/** getProjectId prioritizes the bound project, then the query parameter, then the header, refusing a bound key whose path names another project. */
function getProjectId(
  context: AuthorizationContext,
  req: NextApiRequest,
): ResolvedProject | ErrorResult<ForbiddenError> {
  const boundProjectId = getBoundProjectId(context);
  if (!equal([boundProjectId, getPathProjectId(req)])) {
    return forbiddenError();
  }

  const projectId =
    boundProjectId ?? getUrlProjectId(req) ?? getHeaderProjectId(req);
  if (!projectId) {
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
  return getHeaderValue(req, orgIdHeader);
}

/** getHeaderProjectId returns the target project from the header. */
function getHeaderProjectId(req: NextApiRequest): string | undefined {
  return getHeaderValue(req, projectIdHeader);
}

/** getUrlProjectId returns the target project from the URL param. */
function getUrlProjectId(req: NextApiRequest): string | undefined {
  return typeof req.query.projectId === "string"
    ? req.query.projectId
    : undefined;
}

/** getPathProjectId returns the URL projectId only when it is a path segment, ignoring a query-string projectId. */
function getPathProjectId(req: NextApiRequest): string | undefined {
  const projectId = getUrlProjectId(req);
  if (!projectId || isQueryOnly(req.url, projectId)) return undefined;
  return projectId;
}

/** isQueryOnly reports whether a value is absent from the url's path, failing closed when the path is missing or undecodable. */
function isQueryOnly(url: string | undefined, value: string): boolean {
  if (!url) return false;
  const path = url.split("?")[0] ?? "";
  try {
    return !path.split("/").map(decodeURIComponent).includes(value);
  } catch {
    return false;
  }
}

/** getHeaderValue prefers the X-prefixed alias and normalizes repeated headers to their first value. */
function getHeaderValue(
  req: NextApiRequest,
  header: string,
): string | undefined {
  const value = req.headers[`x-${header}`] ?? req.headers[header];
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

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

/** EnforceAuthParams is the request, the connection action, and the request's key-kind opt-ins. */
export type EnforceAuthParams = {
  req: NextApiRequest;
  action: ApiAction;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** ApiAction is the action a route authorizes at the connection, or the explicit opt-out. */
export type ApiAction = Action | typeof __dangerouslySkipAuthz;

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
      | ServiceUnavailableError
    >;

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

export const __test = {
  getOrgId,
  getProjectId,
};
