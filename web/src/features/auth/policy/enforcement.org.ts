import { type IncomingHttpHeaders } from "http";

import {
  ForbiddenError,
  type InternalServerError,
  InvalidRequestError,
  type UnauthorizedError,
} from "@langfuse/shared";
import { type ApiKey } from "@langfuse/shared/src/db";
import { type ApiAccessScope } from "@langfuse/shared/src/server";

import { authorize } from "./authorize";
import { headerValue } from "./enforce";
import { type AuthenticatedCredential, authenticate } from "./identity";
import { keyScope } from "./scope";
import {
  type AuthorizationContext,
  type ErrorResult,
  type OrganizationAction,
  type PrincipalOrganization,
  type Success,
} from "./types";

/** orgIdHeader selects the target org for keys without a bound org; dead until a Phase 3 multi-scope key exists. */
const orgIdHeader = "x-langfuse-organization-id";

/** orgKeyRequired is the 403 legacy returned when an org route receives a non-organization key. */
const orgKeyRequired = "Access denied - organization key required";

/** enforceOrgAuth runs the new org pipeline — authenticate, org-key gate, target resolution, authorize, scope — returning every outcome as a value; it never throws one. */
export async function enforceOrgAuth(
  params: EnforceOrgAuthParams,
): Promise<OrgAccessResult | ErrorResult<AuthError>> {
  const authn = await authenticate({
    headers: params.headers,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
  if (!authn.success) return authn;

  const { context, credential } = authn;
  const org = orgCredential(credential);
  if (!org.success) return org;

  const target = getOrgId(context, params.headers);
  if (!target.success) return target;

  if (params.action !== undefined) {
    const decision = authorize(context, params.action, { orgId: target.orgId });
    if (!decision.success) return { success: false, error: decision.error };
  }

  const principalOrg = orgOf(context);
  if (!principalOrg) {
    return {
      success: false,
      error: new InvalidRequestError("No organization on principal"),
    };
  }
  const scope = keyScope({
    apiKey: org.apiKey,
    org: principalOrg,
    presentation: "privateKey",
    projectId: null,
  });
  return { success: true, context, orgId: target.orgId, scope };
}

/** orgCredential rejects any credential that is not an organization-scoped private key. */
function orgCredential(
  credential: AuthenticatedCredential,
): (Success & { apiKey: ApiKey }) | ErrorResult<ForbiddenError> {
  if (
    credential.authorization !== "privateKey" ||
    credential.apiKey.scope !== "ORGANIZATION"
  ) {
    return { success: false, error: new ForbiddenError(orgKeyRequired) };
  }
  return { success: true, apiKey: credential.apiKey };
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

/** orgOf returns the single organization an api-key principal carries, when any. */
function orgOf(
  context: AuthorizationContext,
): PrincipalOrganization | undefined {
  if (context.principal.kind === "admin") return undefined;
  return context.principal.organizations[0];
}

/** EnforceOrgAuthParams is the request headers, the checked action, and the route's key-kind opt-ins. */
export type EnforceOrgAuthParams = {
  headers: IncomingHttpHeaders;
  action?: OrganizationAction;
  allowInAppAgentKey?: boolean;
  isAdminApiKeyAuthAllowed?: boolean;
};

/** OrgAccessResult is the org seam's success outcome: the resolved context, target, and scope. */
export type OrgAccessResult = Success & {
  context: AuthorizationContext;
  orgId: string;
  scope: ApiAccessScope;
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
