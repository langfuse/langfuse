import { InternalServerError } from "@langfuse/shared";
import {
  type ApiAccessLevel,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";

import { type Principal } from "@/src/features/auth/policy/types";

/** toApiAccessScope maps an authenticated principal and its resolved target onto the legacy ApiAccessScope. */
// Legacy compatibility; delete once the migration retires ApiAccessScope.
export function toApiAccessScope(
  principal: Principal,
  target: TargetResource,
): ApiAccessScope {
  if (principal.kind === "admin") return adminScope(target);
  if (principal.kind !== "apiKey") {
    throw new InternalServerError(
      `unexpected principal on the public-API seam: ${principal.kind}`,
    );
  }
  return apiKeyScope(principal, target);
}

/** adminScope is the legacy self-host admin scope for a resolved target. */
function adminScope(target: TargetResource): ApiAccessScope {
  return {
    orgId: target.orgId,
    projectId: target.projectId,
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
  target: TargetResource,
): ApiAccessScope {
  const [org] = principal.organizations;
  return {
    orgId: target.orgId,
    projectId: target.projectId,
    plan: org.plan,
    rateLimitOverrides: org.rateLimitOverrides,
    apiKeyId: principal.apiKeyId,
    publicKey: principal.publicKey,
    isIngestionSuspended: org.isIngestionSuspended,
    isInAppAgentKey: principal.isInAppAgentKey,
    accessLevel: apiKeyAccessLevel(principal, target.projectId),
  };
}

/** apiKeyAccessLevel is the access level a key's presentation grants on the target. */
function apiKeyAccessLevel(
  principal: ApiKeyPrincipal,
  projectId: string | null,
): ApiAccessLevel {
  return projectId === null
    ? "organization"
    : principal.presentation === "publicKey"
      ? "scores"
      : "project";
}

/** TargetResource is the resolved org and optional project a seam maps the principal onto. */
export type TargetResource = { orgId: string; projectId: string | null };

/** ApiKeyPrincipal is the api-key variant of `Principal` the mapper consumes. */
type ApiKeyPrincipal = Extract<Principal, { kind: "apiKey" }>;
