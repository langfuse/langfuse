import {
  hasProjectKind,
  type ProjectId,
  type ResourceId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { type Action, type Effect, type Policy } from "./types";
import {
  forbiddenError,
  type AuthorizationContext,
  type Decision,
} from "@/src/features/auth/policy/types";

/** wildcardProjectId is the project-kind wildcard an org role binds to; it matches every project of its tenant but is never a valid authorization target. */
const wildcardProjectId: ProjectId = "project/*";

/** authorize evaluates the tenant's policies for action on resource: with no matching grant, or any matching deny, it 403s; otherwise it succeeds. Admin is the self-host superuser, authorized on every tenant. */
export function authorize(
  ctx: AuthorizationContext,
  tenant: TenantId,
  action: Action,
  resource: ResourceId,
): Decision {
  if (ctx.principal.kind === "admin") return { success: true };
  if (hasWildcard(resource)) return forbiddenError();

  const policiesForResource = matchesResource(ctx, tenant, resource);
  const grant = policiesForResource.filter(byAction(action));
  if (grant.length === 0 || grant.some(byEffect("DENY"))) {
    return forbiddenError();
  }
  return { success: true };
}

/** matchesResource scopes the context to the resource's tenant, preferring an exact-resource match over the project-kind wildcard; org resources need an exact match. */
function matchesResource(
  ctx: AuthorizationContext,
  tenant: TenantId,
  resource: ResourceId,
): Policy[] {
  const owning = ctx.policies.filter(byTenant(tenant));
  const exact = owning.filter(byResource(resource));
  if (exact.length > 0) return exact;
  if (hasProjectKind(resource)) {
    return owning.filter((p) => p.resources.includes(wildcardProjectId));
  }
  return [];
}

/** hasWildcard reports whether resource is the project-kind wildcard, never authorizable in itself. */
const hasWildcard = (resource: ResourceId): boolean =>
  resource === wildcardProjectId;

/** byTenant matches a policy scoped to the resource's tenant. */
const byTenant = (tenant: TenantId) => (p: Policy) => p.tenantId === tenant;

/** byResource matches a policy listing the exact resource. */
const byResource = (resource: ResourceId) => (p: Policy) =>
  p.resources.includes(resource);

/** byAction matches a policy granting the action explicitly; actions are never wildcarded. */
const byAction = (action: Action) => (p: Policy) =>
  (p.actions as readonly string[]).includes(action);

/** byEffect matches a policy of the given effect. */
const byEffect = (effect: Effect) => (p: Policy) => p.effect === effect;
