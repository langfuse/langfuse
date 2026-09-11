import { type NextApiRequest } from "next";

import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
  type UnauthorizedError,
} from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { authorize } from "@/src/features/auth/policy/authorize";
import { authenticator } from "@/src/features/apiKey/authenticator";
import { toApiAccessScope } from "@/src/features/public-api/server/toApiAccessScope";
import {
  isOrgAction,
  type Action,
  type AuthorizationContext,
  type ErrorResult as ErrorResultOf,
  type Principal,
  type Success,
} from "@/src/features/auth/policy/types";

/** orgIdHeader selects the target org. */
const orgIdHeader = "x-langfuse-organization-id";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "x-langfuse-project-id";

/** enforceAuth authenticates the request, then routes it to the admin, organization, or project flow its principal and action select. */
export async function enforceAuth(
  params: EnforceAuthParams,
): Promise<EnforceAuthResult> {
  const authn = await authenticator.authenticate({
    headers: params.req.headers,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
  if (!authn.success) return authn;

  const { context } = authn;
  const { principal } = context;
  if (principal.kind === "admin") {
    return enforceAdminAuth(context, params);
  }
  if (principal.kind !== "apiKey") {
    return internalserver(
      `unexpected principal on the public-API seam: ${principal.kind}`,
    );
  }
  return isOrgAction(params.action)
    ? enforceOrgAuth(context, principal, params)
    : enforceProjectAuth(context, principal, params);
}

/** enforceAdminAuth resolves, authorizes, and scopes a self-host admin-key request against its target project; the authenticator admits admin keys only on opted-in, non-Cloud routes. */
async function enforceAdminAuth(
  context: AuthorizationContext,
  params: EnforceAuthParams,
): Promise<EnforceAuthResult> {
  const project = getProjectId(context, params.req);
  if (!project.success) return project;
  const org = await lookupProjectOrgId(project.projectId);
  if (!org.success) return org;
  const decision = authorize(context, params.action, {
    projectId: project.projectId,
  });
  if (!decision.success) return decision;
  return {
    success: true,
    scope: toApiAccessScope(context.principal, {
      orgId: org.orgId,
      projectId: project.projectId,
    }),
    ctx: context,
  };
}

/** enforceOrgAuth resolves, authorizes, and scopes an organization-scoped api-key request. */
function enforceOrgAuth(
  context: AuthorizationContext,
  principal: ApiKeyPrincipal,
  params: EnforceAuthParams,
): EnforceAuthResult {
  const org = getOrgId(context, params.req);
  if (!org.success) return org;
  const decision = authorize(context, params.action, { orgId: org.orgId });
  if (!decision.success) return { success: false, error: decision.error };
  return {
    success: true,
    scope: toApiAccessScope(principal, { orgId: org.orgId, projectId: null }),
    ctx: context,
  };
}

/** enforceProjectAuth resolves, authorizes, and scopes a project-scoped api-key request against its bound org; an organization key naming a project outside its org is told the project does not exist, as the route handlers do. */
function enforceProjectAuth(
  context: AuthorizationContext,
  principal: ApiKeyPrincipal,
  params: EnforceAuthParams,
): EnforceAuthResult {
  const project = getProjectId(context, params.req);
  if (!project.success) return project;
  if (
    !principal.boundResource.projectId &&
    !ownsProject(principal, project.projectId)
  ) {
    return notfound("Project not found or you don't have access to it");
  }
  const decision = authorize(context, params.action, {
    projectId: project.projectId,
  });
  if (!decision.success) return { success: false, error: decision.error };
  return {
    success: true,
    scope: toApiAccessScope(principal, {
      orgId: principal.boundResource.orgId,
      projectId: project.projectId,
    }),
    ctx: context,
  };
}

/** getOrgId resolves the target org from the header, falling back to the key's bound org; whether the key may act on it is the policy's call. */
function getOrgId(
  context: AuthorizationContext,
  req: NextApiRequest,
): ResolvedOrg | ErrorResult {
  const orgId = first([getHeaderOrgId(req), getBoundOrgId(context)]);
  if (!orgId) {
    return forbidden(`Missing '${orgIdHeader}' header`);
  }
  return { success: true, orgId };
}

/** getProjectId resolves the target project the key's bound project, the URL param, and the header agree on. */
function getProjectId(
  context: AuthorizationContext,
  req: NextApiRequest,
): ResolvedProject | ErrorResult {
  const requested = [
    getBoundProjectId(context),
    getUrlProjectId(req),
    getHeaderProjectId(req),
  ];
  const projectId = first(requested);
  if (!equal(requested) || !projectId) {
    // bare 403 so a probe can't learn which project the key can reach
    return forbidden();
  }
  return { success: true, projectId };
}

/** lookupProjectOrgId reads a project's org from the database, 404ing when the project is absent. */
async function lookupProjectOrgId(
  projectId: string,
): Promise<ResolvedOrg | ErrorResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { orgId: true },
  });
  if (!project) {
    return notfound("Project not found");
  }
  return { success: true, orgId: project.orgId };
}

/** ownsProject reports whether the project belongs to one of the key's organizations. */
const ownsProject = (principal: ApiKeyPrincipal, projectId: string) =>
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

/** forbidden is a 403 ErrorResult carrying an optional message. */
function forbidden(message?: string): ErrorResultOf<ForbiddenError> {
  return { success: false, error: new ForbiddenError(message) };
}

/** notfound is a 404 ErrorResult carrying an optional message. */
function notfound(message?: string): ErrorResultOf<LangfuseNotFoundError> {
  return { success: false, error: new LangfuseNotFoundError(message) };
}

/** internalserver is a 500 ErrorResult carrying an optional message. */
function internalserver(message?: string): ErrorResultOf<InternalServerError> {
  return { success: false, error: new InternalServerError(message) };
}

/** EnforceAuthParams is the request, the checked action, and the request's key-kind opt-ins. */
export type EnforceAuthParams = {
  req: NextApiRequest;
  action: Action;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** AccessResult is the seam's success outcome: the resolved ApiAccessScope and the context that authorized it. */
type AccessResult = Success & {
  scope: ApiAccessScope;
  ctx: AuthorizationContext;
};

/** EnforceAuthResult is the authorized scope, or the typed error the route renders. */
export type EnforceAuthResult = AccessResult | ErrorResult;

/** ErrorResult is a failed enforceAuth outcome carrying any error the pipeline surfaces. */
type ErrorResult = ErrorResultOf<
  | UnauthorizedError
  | InternalServerError
  | ForbiddenError
  | LangfuseNotFoundError
>;

/** ApiKeyPrincipal is the api-key arm of the principal union. */
type ApiKeyPrincipal = Extract<Principal, { kind: "apiKey" }>;

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

export const __test = {
  getOrgId,
  getProjectId,
};
