import { ForbiddenError, InternalServerError } from "@langfuse/shared";
import {
  type ApiAccessLevel,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";

import {
  type ErrorResult,
  type Principal,
  type PrincipalOrganization,
  type Success,
} from "./types";

/** orgScope maps an authorized principal onto the organization-level `ApiAccessScope` direct handlers consume. */
export function orgScope(principal: Principal, orgId: string): ScopeResult {
  const key = apiKeyPrincipalOf(principal);
  if (!key.success) return key;
  const org = key.principal.organizations.find((o) => o.orgId === orgId);
  if (!org) {
    return invariantBreak(
      `api key ${key.principal.apiKeyId} resolved to no organization ${orgId}`,
    );
  }
  return {
    success: true,
    scope: {
      ...credentialFields(key.principal, org),
      projectId: null,
      accessLevel: "organization",
    },
  };
}

/** projectScope maps an authorized principal onto the project-level `ApiAccessScope` direct handlers consume. */
export function projectScope(
  principal: Principal,
  projectId: string,
): ScopeResult {
  const key = apiKeyPrincipalOf(principal);
  if (!key.success) return key;
  const org = key.principal.organizations[0];
  if (!org) {
    return invariantBreak(
      `api key ${key.principal.apiKeyId} resolved to no organization`,
    );
  }
  return {
    success: true,
    scope: {
      ...credentialFields(key.principal, org),
      projectId,
      accessLevel: "project",
    },
  };
}

/** requireAccessLevel denies a credential whose access level is not the one the route requires. */
export function requireAccessLevel(
  principal: Principal,
  required: ApiAccessLevel | undefined,
): ErrorResult<ForbiddenError> | null {
  if (!required || accessLevelOf(principal) === required) return null;
  return { success: false, error: new ForbiddenError() };
}

/** accessLevelOf is the access level a principal presents, or undefined for a credential that carries none. */
export function accessLevelOf(
  principal: Principal,
): ApiAccessLevel | undefined {
  if (principal.kind !== "apiKey") return undefined;
  if (principal.presentation === "publicKey") return "scores";
  return principal.scope === "ORGANIZATION" ? "organization" : "project";
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

/** apiKeyPrincipalOf narrows to the api-key principal the direct seams admit, collapsing any other kind to a 500. */
function apiKeyPrincipalOf(
  principal: Principal,
): (Success & { principal: ApiKeyPrincipal }) | ScopeInvariantBreak {
  if (principal.kind !== "apiKey") {
    return invariantBreak(
      `unexpected principal kind on a direct seam: ${principal.kind}`,
    );
  }
  return { success: true, principal };
}

/** invariantBreak is a 500 for a state the pipeline's own gates should have made unreachable. */
function invariantBreak(message: string): ScopeInvariantBreak {
  return { success: false, error: new InternalServerError(message) };
}

/** ScopeResult is the mapped scope, or the 500 an unmappable principal raises. */
export type ScopeResult =
  | (Success & { scope: ApiAccessScope })
  | ScopeInvariantBreak;

/** ApiKeyPrincipal is the api-key variant of `Principal` the mappers consume. */
type ApiKeyPrincipal = Extract<Principal, { kind: "apiKey" }>;

/** ScopeInvariantBreak is a scope mapping failure. */
type ScopeInvariantBreak = ErrorResult<InternalServerError>;
