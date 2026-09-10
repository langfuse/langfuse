import { type NextApiRequest } from "next";

import {
  type BaseError,
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
  LangfuseNotFoundError,
  type UnauthorizedError,
} from "@langfuse/shared";
import {
  type ApiAccessLevel,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import { authorize } from "@/src/features/auth/policy/authorize";
import { authenticator } from "@/src/features/apiKey/authenticator";
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
  if (!params.allowedAccessLevels.includes(principalAccessLevel(principal))) {
    return errorResult(
      new ForbiddenError(
        "Access denied - insufficient permissions for this endpoint",
      ),
    );
  }
  if (principal.kind === "admin") {
    return enforceAdminAuth(context, params);
  }
  if (principal.kind !== "apiKey") {
    return invariantBreak(
      `unexpected principal on the public-API seam: ${principal.kind}`,
    );
  }
  return isOrgAction(params.action)
    ? enforceOrgAuth(context, principal, params)
    : enforceProjectAuth(context, principal, params);
}

/** enforceAdminAuth resolves, authorizes, and scopes a self-host admin-key request against its target project, 500ing on organization-scoped actions it cannot serve. */
async function enforceAdminAuth(
  context: AuthorizationContext,
  params: EnforceAuthParams,
): Promise<EnforceAuthResult> {
  if (isOrgAction(params.action)) {
    return invariantBreak(
      "admin API key cannot serve an organization-scoped action",
    );
  }
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return errorResult(
      new ForbiddenError(
        "Admin API key auth is not available on Langfuse Cloud",
      ),
    );
  }
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
    scope: adminScope(org.orgId, project.projectId),
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
    scope: apiKeyScope(principal, org.orgId, null),
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
    return errorResult(
      new LangfuseNotFoundError(
        "Project not found or you don't have access to it",
      ),
    );
  }
  const decision = authorize(context, params.action, {
    projectId: project.projectId,
  });
  if (!decision.success) return { success: false, error: decision.error };
  return {
    success: true,
    scope: apiKeyScope(
      principal,
      principal.boundResource.orgId,
      project.projectId,
    ),
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
    return errorResult(new ForbiddenError(`Missing '${orgIdHeader}' header`));
  }
  return { success: true, orgId };
}

/** getProjectId resolves the target project from the URL param and header, which must agree, falling back to the key's bound project; whether the key may act on it is the policy's call. */
function getProjectId(
  context: AuthorizationContext,
  req: NextApiRequest,
): ResolvedProject | ErrorResult {
  const requested = [getUrlProjectId(req), getHeaderProjectId(req)];
  if (!equal(requested)) {
    return errorResult(
      new InvalidRequestError(`Project id parameters disagree`),
    );
  }
  const projectId = first([...requested, getBoundProjectId(context)]);
  if (!projectId) {
    return errorResult(
      new ForbiddenError(`Missing '${projectIdHeader}' header`),
    );
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
    return errorResult(new LangfuseNotFoundError("Project not found"));
  }
  return { success: true, orgId: project.orgId };
}

/** adminScope is the legacy self-host admin scope for a resolved project. */
function adminScope(orgId: string, projectId: string): ApiAccessScope {
  return {
    orgId,
    projectId,
    accessLevel: "project",
    plan: "oss",
    rateLimitOverrides: [],
    apiKeyId: "ADMIN_API_KEY",
    publicKey: "ADMIN_API_KEY",
    isIngestionSuspended: false,
    isInAppAgentKey: false,
  };
}

/** apiKeyScope maps an api-key principal and its resolved target onto the ApiAccessScope. */
function apiKeyScope(
  principal: ApiKeyPrincipal,
  orgId: string,
  projectId: string | null,
): ApiAccessScope {
  const [org] = principal.organizations;
  return {
    orgId,
    projectId,
    plan: org.plan,
    rateLimitOverrides: org.rateLimitOverrides,
    apiKeyId: principal.apiKeyId,
    publicKey: principal.publicKey,
    isIngestionSuspended: org.isIngestionSuspended,
    isInAppAgentKey: principal.isInAppAgentKey,
    accessLevel: apiKeyAccessLevel(principal, projectId),
  };
}

/** principalAccessLevel is the access level a credential's kind and presentation carry, which the route's allowed levels gate. */
function principalAccessLevel(principal: Principal): ApiAccessLevel {
  if (principal.kind !== "apiKey") return "project";
  if (principal.scope === "ORGANIZATION") return "organization";
  return principal.presentation === "publicKey" ? "scores" : "project";
}

/** ownsProject reports whether the project belongs to one of the key's organizations. */
const ownsProject = (principal: ApiKeyPrincipal, projectId: string) =>
  principal.organizations.some((o) => o.projectIds.includes(projectId));

/** apiKeyAccessLevel is the access level a key's presentation grants on the target. */
const apiKeyAccessLevel = (
  principal: ApiKeyPrincipal,
  projectId: string | null,
): ApiAccessLevel =>
  projectId === null
    ? "organization"
    : principal.presentation === "publicKey"
      ? "scores"
      : "project";

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

function getHeaderOrgId(req: NextApiRequest): string | undefined {
  return getHeaderValue(req.headers[orgIdHeader]) || undefined;
}

function getHeaderProjectId(req: NextApiRequest): string | undefined {
  return getHeaderValue(req.headers[projectIdHeader]) || undefined;
}

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

/** errorResult wraps a BaseError subclass into a typed ErrorResult. */
function errorResult<E extends BaseError>(e: E): ErrorResultOf<E> {
  return { success: false, error: e };
}

/** invariantBreak is a 500 for a state that should be unreachable. */
function invariantBreak(message: string): ErrorResult {
  return { success: false, error: new InternalServerError(message) };
}

/** EnforceAuthParams is the request, the checked action, the access levels the route admits, and its key-kind opt-ins. */
export type EnforceAuthParams = {
  req: NextApiRequest;
  action: Action;
  allowedAccessLevels: ApiAccessLevel[];
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
  | InvalidRequestError
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
  apiKeyScope,
};
