import { type IncomingHttpHeaders } from "http";

import {
  type ForbiddenError,
  type InternalServerError,
  InvalidRequestError,
  type UnauthorizedError,
} from "@langfuse/shared";

import { authorize } from "./authorize";
import { authenticate } from "@/src/features/apiKey/authenticator";
import {
  type AuthorizationContext,
  type ErrorResult,
  type ProjectAction,
  type Success,
} from "./types";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "x-langfuse-project-id";

/** headerValue normalizes a possibly-repeated header to its first value. */
const headerValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/** enforceProjectAuth runs the new project pipeline — authenticate, its own target resolution, authorize — returning every outcome as a value; it never throws one. */
export async function enforceProjectAuth(
  params: EnforceProjectAuthParams,
): Promise<ProjectAccessResult | ErrorResult<AuthError>> {
  const authn = await authenticate({
    headers: params.headers,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
  if (!authn.success) return authn;

  const context = authn.context;
  const target = getProjectId(context, params.headers);
  if (!target.success) return target;

  if (params.action === undefined) {
    return { success: true, context, projectId: target.projectId };
  }
  const decision = authorize(context, params.action, {
    projectId: target.projectId,
  });
  if (!decision.success) {
    return { success: false, error: decision.error };
  }
  return { success: true, context, projectId: target.projectId };
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

/** EnforceProjectAuthParams is the request headers, the checked action, and the route's key-kind opt-ins. */
export type EnforceProjectAuthParams = {
  headers: IncomingHttpHeaders;
  action?: ProjectAction;
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

/** EnforceProjectAuthDecision is the project pipeline's outcome — `enforceProjectAuth`'s return. */
export type EnforceProjectAuthDecision = Awaited<
  ReturnType<typeof enforceProjectAuth>
>;

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

/** __test exposes module-private helpers for the colocated unit test. */
export const __test = { getProjectId };
