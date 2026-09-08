import { type IncomingHttpHeaders } from "http";

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
  type AuthorizationContext,
  type ErrorResult,
  type ProjectAction,
  type Success,
} from "./types";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "x-langfuse-project-id";

/** enforceProjectAuth runs the new project pipeline — authenticate, its own target resolution, authorize — returning every outcome as a value; it never throws one. */
export async function enforceProjectAuth(
  params: EnforceProjectAuthParams,
): Promise<ProjectAccessResult | ErrorResult<AuthError>> {
  const authn = await authenticator.authenticate({
    headers: params.headers,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
  if (!authn.success) return authn;

  const context = authn.context;
  const target = getProjectId(context, params.headers);
  if (!target.success) return target;

  const decision = authorize(context, params.action, {
    projectId: target.projectId,
  });
  if (!decision.success) {
    return { success: false, error: decision.error };
  }
  return { success: true, context, projectId: target.projectId };
}

/** getProjectId resolves the target project as `header ?? boundResource`; a header disagreeing with the bound project 400s, no target 403s. */
function getProjectId(
  context: AuthorizationContext,
  headers: IncomingHttpHeaders,
): ResolvedProject | ErrorResult<InvalidRequestError | ForbiddenError> {
  const boundProjectId = boundProjectIdOf(context);
  const header = headerValue(headers[projectIdHeader]) || undefined;
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

/** boundProjectIdOf returns the project an api key is bound to, when it is project-scoped. */
function boundProjectIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  return context.principal.boundResource.projectId;
}

/** EnforceProjectAuthParams is the request headers, the checked action, and the route's key-kind opt-ins. */
export type EnforceProjectAuthParams = {
  headers: IncomingHttpHeaders;
  action: ProjectAction;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** ProjectAccessResult is the project seam's success outcome: the resolved context and target. */
export type ProjectAccessResult = Success & {
  context: AuthorizationContext;
  projectId: string;
};

/** AuthError is any typed failure the project pipeline surfaces. */
export type AuthError =
  | UnauthorizedError
  | InvalidRequestError
  | InternalServerError
  | ForbiddenError;

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

/** __test exposes module-private helpers for the colocated unit test. */
export const __test = { getProjectId };
