import { type IncomingHttpHeaders } from "http";

import { type NextApiRequest } from "next";

import {
  ForbiddenError,
  type InternalServerError,
  InvalidRequestError,
  type UnauthorizedError,
} from "@langfuse/shared";

import { authorize } from "./authorize";
import { headerValue } from "./headers";
import { authenticator } from "@/src/features/apiKey/authenticator";
import {
  isOrgAction,
  type Action,
  type AuthorizationContext,
  type ErrorResult,
  type Resource,
  type Success,
} from "./types";

/** orgIdHeader selects the target org. */
const orgIdHeader = "x-langfuse-organization-id";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "x-langfuse-project-id";

/** enforceAuth authenticates the request, resolves the org or project target its action implies, and authorizes it. */
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
  return { success: true, context, target };
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

/** EnforceAuthParams is the request, the checked action, and the route's key-kind opt-ins. */
export type EnforceAuthParams = {
  req: NextApiRequest;
  action: Action;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** AccessResult is the seam's success outcome: the resolved context and target. */
export type AccessResult = Success & {
  context: AuthorizationContext;
  target: Resource;
};

/** AuthError is any typed failure the pipeline surfaces. */
export type AuthError =
  | UnauthorizedError
  | InvalidRequestError
  | InternalServerError
  | ForbiddenError;

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

export const __test = { getOrgId, getProjectId };
