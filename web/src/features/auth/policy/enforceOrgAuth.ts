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
  type OrganizationAction,
  type Success,
} from "./types";

/** orgIdHeader is the header selecting the target org. */
const orgIdHeader = "x-langfuse-organization-id";

/** enforceOrgAuth authenticates, resolves the org target, and authorizes, returning every outcome as a value. */
export async function enforceOrgAuth(
  params: EnforceOrgAuthParams,
): Promise<OrgAccessResult | ErrorResult<AuthError>> {
  const authn = await authenticator.authenticate({
    headers: params.headers,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
  if (!authn.success) return authn;

  const context = authn.context;
  const target = getOrgId(context, params.headers);
  if (!target.success) return target;

  const decision = authorize(context, params.action, { orgId: target.orgId });
  if (!decision.success) {
    return { success: false, error: decision.error };
  }
  return { success: true, context, orgId: target.orgId };
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

/** boundOrgIdOf returns the org an api key is bound to. */
function boundOrgIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  return context.principal.boundResource.orgId;
}

/** EnforceOrgAuthParams is the request headers, the checked action, and the route's key-kind opt-ins. */
export type EnforceOrgAuthParams = {
  headers: IncomingHttpHeaders;
  action: OrganizationAction;
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

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

export const __test = { getOrgId };
