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

  const adminAuth = await enforceAdminAuth(auth.context, req, action);
  if (adminAuth) return adminAuth;

  const orgAuth = await enforceOrgAuth(auth.context, req, action);
  if (orgAuth) return orgAuth;

  const projectAuth = await enforceProjectAuth(auth.context, req, action);
  if (projectAuth) return projectAuth;

  return internalServerError(`unexpected principal on the public-API`);
}

/** enforceAdminAuth resolves, authorizes, and scopes a self-host admin-key request against its target project; the authenticator admits admin keys only on opted-in, non-Cloud routes. */
async function enforceAdminAuth(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: Action,
): Promise<EnforceAuthResult | null> {
  if (context.principal.kind !== "admin") return null;

  const project = getProjectId(context, req);
  if (!project.success) return project;

  const org = await lookupProjectOrgId(project.projectId);
  if (!org.success) return org;

  const decision = authorize(context, action, {
    projectId: project.projectId,
  });
  if (!decision.success) return decision;

  return access(context, org.orgId, project.projectId);
}

/** enforceOrgAuth resolves, authorizes, and scopes an organization-scoped api-key request. */
function enforceOrgAuth(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: Action,
): EnforceAuthResult | null {
  if (context.principal.kind !== "apiKey" || !isOrgAction(action)) return null;

  const org = getOrgId(context, req);
  if (!org.success) return org;

  const decision = authorize(context, action, { orgId: org.orgId });
  if (!decision.success) return decision;

  return access(context, org.orgId);
}

/** enforceProjectAuth resolves, authorizes, and scopes a project-scoped api-key request against its bound org; an organization key naming a project outside its org is told the project does not exist, as the route handlers do. */
function enforceProjectAuth(
  context: AuthorizationContext,
  req: NextApiRequest,
  action: Action,
): EnforceAuthResult | null {
  if (context.principal.kind !== "apiKey" || isOrgAction(action)) return null;

  const project = getProjectId(context, req);
  if (!project.success) return project;

  if (!ownsProject(context.principal, project.projectId)) {
    return notFoundError("Project not found or you don't have access to it");
  }

  const decision = authorize(context, action, {
    projectId: project.projectId,
  });
  if (!decision.success) return decision;

  return access(
    context,
    context.principal.boundResource.orgId,
    project.projectId,
  );
}

/** getOrgId resolves the target org from the header, falling back to the key's bound org; whether the key may act on it is the policy's call. */
function getOrgId(
  context: AuthorizationContext,
  req: NextApiRequest,
): ResolvedOrg | ErrorResult {
  const orgId = first([getHeaderOrgId(req), getBoundOrgId(context)]);
  if (!orgId) {
    return forbiddenError(`Missing '${orgIdHeader}' header`);
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
    return forbiddenError();
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

/** forbiddenError is a 403 ErrorResult carrying an optional message. */
function forbiddenError(message?: string): ErrorResultOf<ForbiddenError> {
  return { success: false, error: new ForbiddenError(message) };
}

/** notFoundError is a 404 ErrorResult carrying an optional message. */
function notFoundError(message?: string): ErrorResultOf<LangfuseNotFoundError> {
  return { success: false, error: new LangfuseNotFoundError(message) };
}

/** internalServerError is a 500 ErrorResult carrying an optional message. */
function internalServerError(
  message?: string,
): ErrorResultOf<InternalServerError> {
  return { success: false, error: new InternalServerError(message) };
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

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

export const __test = {
  getOrgId,
  getProjectId,
};
