/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  hasProjectKind,
  type Action,
  type Effect,
  type OrganizationId,
  type ProjectId,
  type ResourceId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { type Policy } from "./types";
import {
  forbiddenError,
  type AuthorizationContext,
  type Decision,
} from "@/src/features/auth/policy/types";

/** wildcardProjectId matches every project of a tenant. */
const wildcardProjectId: ProjectId = "project/*";

/** wildcardOrgId matches every tenant and every organization. */
const wildcardOrgId: OrganizationId = "organization/*";

/** authorize allows action on resource only when the context has policy sets and every one of them allows it. */
export function authorize(
  ctx: AuthorizationContext,
  tenant: TenantId,
  action: Action,
  resource: ResourceId,
): Decision {
  if (hasWildcard(resource)) return forbiddenError();
  if (ctx.policies.length === 0) return deniedError(action);

  for (const policies of ctx.policies) {
    const decision = authorizePolicySet(policies, tenant, action, resource);
    if (!decision.success) return decision;
  }
  return { success: true };
}

/** authorizePolicySet allows action on resource when the set grants it and denies none of it. */
function authorizePolicySet(
  policies: Policy[],
  tenant: TenantId,
  action: Action,
  resource: ResourceId,
): Decision {
  const policiesForResource = matchesResource(policies, tenant, resource);
  const grant = policiesForResource.filter(byAction(action));
  if (grant.length === 0 || grant.some(byEffect("DENY"))) {
    return deniedError(action);
  }
  return { success: true };
}

/** matchesResource selects the tenant's policies for resource, preferring exact matches over wildcards. */
function matchesResource(
  policies: Policy[],
  tenant: TenantId,
  resource: ResourceId,
): Policy[] {
  const owning = policies.filter(byTenant(tenant));
  const exact = owning.filter(byResource(resource));
  if (exact.length > 0) return exact;
  const wildcard = hasProjectKind(resource) ? wildcardProjectId : wildcardOrgId;
  return owning.filter((p) => p.resources.includes(wildcard));
}

/** deniedError is the 403 naming the missing permission. */
const deniedError = (action: Action): Decision =>
  forbiddenError(
    `Access denied. The "${action}" permission is required to access this resource.`,
  );

/** hasWildcard reports whether resource is a wildcard, which is never authorizable. */
const hasWildcard = (resource: ResourceId): boolean =>
  resource === wildcardProjectId || resource === wildcardOrgId;

/** byTenant matches a policy in tenant or in the wildcard tenant. */
const byTenant = (tenant: TenantId) => (p: Policy) =>
  p.tenantId === tenant || p.tenantId === wildcardOrgId;

const byResource = (resource: ResourceId) => (p: Policy) =>
  p.resources.includes(resource);

const byAction = (action: Action) => (p: Policy) =>
  (p.actions as readonly string[]).includes(action);

const byEffect = (effect: Effect) => (p: Policy) => p.effect === effect;
