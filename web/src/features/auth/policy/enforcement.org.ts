import { type IncomingHttpHeaders } from "http";

import {
  type ForbiddenError,
  type InternalServerError,
  InvalidRequestError,
  type UnauthorizedError,
} from "@langfuse/shared";

import { authorize } from "./authorize";
import { headerValue } from "./enforce";
import { authenticate } from "./identity";
import {
  type AuthorizationContext,
  type ErrorResult,
  type OrganizationAction,
  type Success,
} from "./types";

/** orgIdHeader selects the target org for keys without a bound org; dead until a Phase 3 multi-scope key exists. */
const orgIdHeader = "x-langfuse-organization-id";

/** enforceOrgAuth runs the new org pipeline — authenticate, its own target resolution, authorize — returning every outcome as a value; it never throws one. */
export async function enforceOrgAuth(
  params: EnforceOrgAuthParams,
): Promise<OrgAccessResult | ErrorResult<AuthError>> {
  const authn = await authenticate({
    headers: params.headers,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
  if (!authn.success) return authn;

  const context = authn.context;
  const target = getOrgId(context, params.headers);
  if (!target.success) return target;

  if (params.action === undefined) {
    return { success: true, context, orgId: target.orgId };
  }
  const decision = authorize(context, params.action, { orgId: target.orgId });
  if (!decision.success) {
    return { success: false, error: decision.error };
  }
  return { success: true, context, orgId: target.orgId };
}

/** getOrgId resolves the target org as `header ?? boundResource ?? 400`; a header disagreeing with the bound org 400s. */
function getOrgId(
  context: AuthorizationContext,
  headers: IncomingHttpHeaders,
): ResolvedOrg | ErrorResult<InvalidRequestError> {
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
      error: new InvalidRequestError(
        `No organization target: send ${orgIdHeader} or use an organization-scoped API key`,
      ),
    };
  }
  return { success: true, orgId };
}

/** boundOrgIdOf returns the org an api key is bound to, when any. */
function boundOrgIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  const bound = context.principal.boundResource;
  return bound && "orgId" in bound ? bound.orgId : undefined;
}

/** EnforceOrgAuthParams is the request headers, the checked action, and the route's key-kind opt-ins. */
export type EnforceOrgAuthParams = {
  headers: IncomingHttpHeaders;
  action?: OrganizationAction;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** OrgAccessResult is the org seam's success outcome: the resolved context and target. */
export type OrgAccessResult = Success & {
  context: AuthorizationContext;
  orgId: string;
};

/** AuthError is any typed failure the org pipeline surfaces. */
export type AuthError =
  | UnauthorizedError
  | InvalidRequestError
  | InternalServerError
  | ForbiddenError;

/** EnforceOrgAuthDecision is the org pipeline's outcome — `enforceOrgAuth`'s return. */
export type EnforceOrgAuthDecision = Awaited<ReturnType<typeof enforceOrgAuth>>;

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** __test exposes module-private helpers for the colocated unit test. */
export const __test = { getOrgId };
