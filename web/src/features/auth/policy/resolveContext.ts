import { type ApiKey } from "@langfuse/shared/src/db";

import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import {
  wildcard,
  type AuthorizationContext,
  type Policy,
  type Principal,
  type PrincipalOrganization,
  type Resource,
  type Success,
  type SystemPolicy,
} from "./types";

/** resolveContext materializes an authenticated credential into its `AuthorizationContext`; pure — the caller pre-enriches the organization. */
export function resolveContext(input: ResolveContextParams): Resolved {
  if (input.authorization === "adminKey") {
    return { success: true, context: adminContext() };
  }
  const { apiKey, authorization, organization } = input;
  return {
    success: true,
    context: materialize(apiKey, authorization, organization),
  };
}

/** materialize expands the `ApiKey` row and its presentation into the policies the credential implies. */
function materialize(
  apiKey: ApiKey,
  authorization: "publicKey" | "privateKey",
  org: PrincipalOrganization,
): AuthorizationContext {
  const principal: Principal = {
    kind: "apiKey",
    apiKeyId: apiKey.id,
    userId: apiKey.createdByUserId,
    organizations: [org],
    boundResource: boundResourceFor(apiKey),
  };

  const grants =
    authorization === "publicKey"
      ? apiKeyAccessRights.SCORES_INGEST
      : apiKeyAccessRights[apiKey.scope];
  const policies = grants.map((p) => bind(p, principal));
  return { principal, policies };
}

/** adminContext is the admin context: no key row, the ADMIN role bound to the wildcard resource. */
function adminContext(): AuthorizationContext {
  const principal: Principal = { kind: "admin", userId: null };
  return {
    principal,
    policies: apiKeyAccessRights.ADMIN.map((policy) => bind(policy, principal)),
  };
}

/** bind fixes a resource-less SystemPolicy to the resources the principal covers, by the policy's kind. */
function bind(policy: SystemPolicy, principal: Principal): Policy {
  return policy.kind === "organization"
    ? { ...policy, resources: orgResources(principal) }
    : { ...policy, resources: projectResources(principal) };
}

/** projectResources are the project ids a project-kind policy binds to: the bound project, the bound org's projects, or the wildcard for admin. */
function projectResources(principal: Principal): Policy["resources"] {
  if (principal.kind === "admin") return wildcard;
  const bound =
    principal.kind === "apiKey" ? principal.boundResource : undefined;
  if (bound && "projectId" in bound) return [bound.projectId];
  const orgs =
    bound && "orgId" in bound
      ? principal.organizations.filter((o) => o.orgId === bound.orgId)
      : principal.organizations;
  return orgs.flatMap((o) => o.projectIds);
}

/** orgResources are the org ids an org-kind policy binds to: the bound org, or the wildcard for admin. */
function orgResources(principal: Principal): Policy["resources"] {
  if (principal.kind === "admin") return wildcard;
  const bound =
    principal.kind === "apiKey" ? principal.boundResource : undefined;
  const orgs =
    bound && "orgId" in bound
      ? principal.organizations.filter((o) => o.orgId === bound.orgId)
      : principal.organizations;
  return orgs.map((o) => o.orgId);
}

/** boundResourceFor is the legacy single-target a request resolves against with no header. */
function boundResourceFor(apiKey: ApiKey): Resource {
  if (apiKey.scope === "ORGANIZATION") return { orgId: apiKey.orgId! };
  return { projectId: apiKey.projectId! };
}

/** ResolveContextParams is an authenticated credential with its pre-enriched organization, or the admin key. */
export type ResolveContextParams =
  | {
      authorization: "publicKey" | "privateKey";
      apiKey: ApiKey;
      organization: PrincipalOrganization;
    }
  | { authorization: "adminKey" };

/** Resolved is the materialized context; resolveContext only materializes and never fails. */
export type Resolved = Success & { context: AuthorizationContext };
