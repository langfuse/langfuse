import { type IncomingHttpHeaders } from "http";

import { type NextApiRequest } from "next";

import {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
  LangfuseNotFoundError,
  type UnauthorizedError,
} from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import { authorize } from "@/src/features/auth/policy/authorize";
import { authenticator } from "@/src/features/apiKey/authenticator";
import {
  isOrgAction,
  type Action,
  type AuthorizationContext,
  type ErrorResult,
  type Principal,
  type PrincipalOrganization,
  type Resource,
  type Success,
} from "@/src/features/auth/policy/types";

/** orgIdHeader selects the target org. */
const orgIdHeader = "x-langfuse-organization-id";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "x-langfuse-project-id";

/** headerValue normalizes a possibly-repeated header to its first value. */
const headerValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/** enforceAuth authenticates the request, resolves the org or project target its action implies, authorizes it, and maps the principal onto the ApiAccessScope. */
export async function enforceAuth(
  params: EnforceAuthParams,
): Promise<AccessResult | ErrorResult<AuthError>> {
  const authn = await authenticator.authenticate({
    headers: params.req.headers,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
  if (!authn.success) return authn;

  const context = authn.context;
  const resolved = isOrgAction(params.action)
    ? getOrgId(context, params.req.headers)
    : getProjectId(context, params.req);
  if (!resolved.success) return resolved;

  const target: Resource =
    "orgId" in resolved
      ? { orgId: resolved.orgId }
      : { projectId: resolved.projectId };
  const decision = authorize(context, params.action, target);
  if (!decision.success) {
    return { success: false, error: decision.error };
  }
  return toApiAccessScope(context, target);
}

/** getOrgId resolves the target org from the header or the key's bound org. */
function getOrgId(
  context: AuthorizationContext,
  headers: IncomingHttpHeaders,
): ResolvedOrg | ErrorResult<InvalidRequestError | ForbiddenError> {
  const boundOrgId = boundOrgIdOf(context);
  const header = headerValue(headers[orgIdHeader]);
  if (header && boundOrgId && header !== boundOrgId) {
    return {
      success: false,
      error: new InvalidRequestError(
        `${orgIdHeader} disagrees with the API key's organization`,
      ),
    };
  }
  const orgId = header ?? boundOrgId;
  if (!orgId) {
    return {
      success: false,
      error: new ForbiddenError(
        `No organization target: send ${orgIdHeader} or use an organization-scoped API key`,
      ),
    };
  }
  return { success: true, orgId };
}

/** getProjectId resolves the target project from the URL param, the header, or the key's bound project. */
function getProjectId(
  context: AuthorizationContext,
  req: NextApiRequest,
): ResolvedProject | ErrorResult<InvalidRequestError | ForbiddenError> {
  const urlProjectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (urlProjectId) return { success: true, projectId: urlProjectId };

  const boundProjectId = boundProjectIdOf(context);
  const header = headerValue(req.headers[projectIdHeader]) || undefined;
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
      error: new ForbiddenError(
        `No project target: send ${projectIdHeader} or use a project-scoped API key`,
      ),
    };
  }
  return { success: true, projectId };
}

/** boundOrgIdOf returns the org an api key is bound to. */
function boundOrgIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  return context.principal.boundResource.orgId;
}

/** boundProjectIdOf returns the project an api key is bound to, when it is project-scoped. */
function boundProjectIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  return context.principal.boundResource.projectId;
}

/** toApiAccessScope maps an authorized context's principal onto the ApiAccessScope for the resolved org or project target. */
async function toApiAccessScope(
  context: AuthorizationContext,
  target: Resource,
): Promise<ScopeResult> {
  const { principal } = context;
  return "orgId" in target
    ? orgScope(principal, target.orgId)
    : projectScope(principal, target.projectId);
}

/** orgScope maps an authorized principal onto the organization-level scope. */
function orgScope(principal: Principal, orgId: string): ScopeResult {
  if (principal.kind !== "apiKey") {
    return invariantBreak(
      `unexpected principal kind on the org seam: ${principal.kind}`,
    );
  }
  const org = principal.organizations.find((o) => o.orgId === orgId);
  if (!org) {
    return invariantBreak(
      `api key ${principal.apiKeyId} resolved to no organization ${orgId}`,
    );
  }
  return {
    success: true,
    scope: {
      ...credentialFields(principal, org),
      projectId: null,
      accessLevel: "organization",
    },
  };
}

/** projectScope maps an authorized principal onto the project-level scope. */
async function projectScope(
  principal: Principal,
  projectId: string,
): Promise<ScopeResult> {
  if (principal.kind === "admin") return adminScope(projectId);
  if (principal.kind !== "apiKey") {
    return invariantBreak(
      `unexpected principal kind on the project seam: ${principal.kind}`,
    );
  }
  const org = principal.organizations[0];
  if (!org) {
    return invariantBreak(
      `api key ${principal.apiKeyId} resolved to no organization`,
    );
  }
  return {
    success: true,
    scope: {
      ...credentialFields(principal, org),
      projectId,
      accessLevel:
        principal.presentation === "publicKey" ? "scores" : "project",
    },
  };
}

/** adminScope synthesizes the legacy self-host admin scope for a project. */
async function adminScope(projectId: string): Promise<ScopeResult> {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return {
      success: false,
      error: new ForbiddenError(
        "Admin API key auth is not available on Langfuse Cloud",
      ),
    };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { id: true, orgId: true },
  });
  if (!project) {
    return {
      success: false,
      error: new LangfuseNotFoundError("Project not found"),
    };
  }
  return {
    success: true,
    scope: {
      projectId: project.id,
      accessLevel: "project",
      orgId: project.orgId,
      plan: "oss",
      rateLimitOverrides: [],
      apiKeyId: "ADMIN_API_KEY",
      publicKey: "ADMIN_API_KEY",
      isIngestionSuspended: false,
      isInAppAgentKey: false,
    },
  };
}

/** credentialFields are the scope fields both access levels read off the key and its organization. */
function credentialFields(
  principal: ApiKeyPrincipal,
  org: PrincipalOrganization,
) {
  return {
    orgId: org.orgId,
    plan: org.plan,
    rateLimitOverrides: org.rateLimitOverrides,
    apiKeyId: principal.apiKeyId,
    publicKey: principal.publicKey,
    isIngestionSuspended: org.isIngestionSuspended,
    isInAppAgentKey: principal.isInAppAgentKey,
  };
}

/** invariantBreak is a 500 for a state that should be unreachable. */
function invariantBreak(message: string): ErrorResult<InternalServerError> {
  return { success: false, error: new InternalServerError(message) };
}

/** EnforceAuthParams is the request, the checked action, and the route's key-kind opt-ins. */
export type EnforceAuthParams = {
  req: NextApiRequest;
  action: Action;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** AccessResult is the seam's success outcome: the resolved ApiAccessScope. */
export type AccessResult = Success & { scope: ApiAccessScope };

/** AuthError is any typed failure the pipeline surfaces. */
export type AuthError =
  | UnauthorizedError
  | InvalidRequestError
  | InternalServerError
  | ForbiddenError
  | LangfuseNotFoundError;

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

/** ScopeResult is the mapped scope, or the typed error an unmappable principal raises. */
type ScopeResult = AccessResult | ErrorResult<ScopeError>;

/** ScopeError is any typed failure the scope mapper surfaces. */
type ScopeError = InternalServerError | ForbiddenError | LangfuseNotFoundError;

/** ApiKeyPrincipal is the api-key variant of `Principal` the scope mapper consumes. */
type ApiKeyPrincipal = Extract<Principal, { kind: "apiKey" }>;

export const __test = { getOrgId, getProjectId, toApiAccessScope };
