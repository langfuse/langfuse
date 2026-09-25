import {
  hasProjectKind,
  type OrganizationId,
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

/** wildcardOrgId is the org-kind wildcard a cross-tenant role binds to; as a tenant it matches every tenant, and as a resource it matches every org target, but it is never a valid authorization target itself. */
const wildcardOrgId: OrganizationId = "organization/*";

/** authorize evaluates the tenant's policies for action on resource: with no matching grant, or any matching deny, it 403s; otherwise it succeeds. A policy on the organization/* tenant matches every tenant, and an organization/* resource matches every org target — the machinery the all-tenant admin role evaluates through. */
export function authorize(
  ctx: AuthorizationContext,
  tenant: TenantId,
  action: Action,
  resource: ResourceId,
): Decision {
  if (hasWildcard(resource)) return forbiddenError();

  const policiesForResource = matchesResource(ctx, tenant, resource);
  const grant = policiesForResource.filter(byAction(action));
  if (grant.length === 0 || grant.some(byEffect("DENY"))) {
    return forbiddenError();
  }
  return { success: true };
}

/** matchesResource scopes the context to the resource's tenant, preferring an exact-resource match over the kind's wildcard: a project target falls back to project/*, an org target to organization/*. */
function matchesResource(
  ctx: AuthorizationContext,
  tenant: TenantId,
  resource: ResourceId,
): Policy[] {
  const owning = ctx.policies.filter(byTenant(tenant));
  const exact = owning.filter(byResource(resource));
  if (exact.length > 0) return exact;
  const wildcard = hasProjectKind(resource) ? wildcardProjectId : wildcardOrgId;
  return owning.filter((p) => p.resources.includes(wildcard));
}

/** hasWildcard reports whether resource is a kind wildcard, never authorizable in itself. */
const hasWildcard = (resource: ResourceId): boolean =>
  resource === wildcardProjectId || resource === wildcardOrgId;

/** byTenant matches a policy scoped to the resource's tenant, or to the organization/* wildcard tenant that spans every tenant. */
const byTenant = (tenant: TenantId) => (p: Policy) =>
  p.tenantId === tenant || p.tenantId === wildcardOrgId;

/** byResource matches a policy listing the exact resource. */
const byResource = (resource: ResourceId) => (p: Policy) =>
  p.resources.includes(resource);

/** byAction matches a policy granting the action explicitly; actions are never wildcarded. */
const byAction = (action: Action) => (p: Policy) =>
  (p.actions as readonly string[]).includes(action);

/** byEffect matches a policy of the given effect. */
const byEffect = (effect: Effect) => (p: Policy) => p.effect === effect;
