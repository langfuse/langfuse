/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  hasGroupKind,
  hasProjectKind,
  type Action,
  type Effect,
  type OrganizationId,
  type ProjectId,
  type ResourceId,
  type RoleId,
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
  ctx: Pick<AuthorizationContext, "policies">,
  tenant: TenantId,
  action: Action,
  resource: ResourceId,
): Decision {
  if (hasWildcard(resource)) return forbiddenError();
  if (ctx.policies.length === 0) return deniedError(action);

  for (const policies of ctx.policies) {
    if (!hasAccess(policies, tenant, action, resource)) {
      return deniedError(action);
    }
  }
  return { success: true };
}

/** rolesFor lists the roles whose policies govern resource in tenant, an exact resource match taking precedence over a wildcard. */
export function rolesFor(
  ctx: Pick<AuthorizationContext, "policies">,
  tenant: TenantId,
  resource: ResourceId,
): RoleId[] {
  const roleIds = ctx.policies.flatMap((policies) =>
    matchesResource(policies, tenant, resource).map((policy) => policy.roleId),
  );
  return [...new Set(roleIds)];
}

/** hasAccess reports whether the policy set grants action on resource and denies none of it. */
function hasAccess(
  policies: Policy[],
  tenant: TenantId,
  action: Action,
  resource: ResourceId,
): boolean {
  const access = matchesResource(policies, tenant, resource).filter(
    byAction(action),
  );
  return access.length > 0 && !access.some(byEffect("DENY"));
}

/** matchesResource selects the tenant's policies for resource: the principal's own plus its groups'. */
function matchesResource(
  policies: Policy[],
  tenant: TenantId,
  resource: ResourceId,
): Policy[] {
  const tenantPolicies = policies.filter(byTenant(tenant));
  return [
    ...directlyAssignedPolicies(tenantPolicies, resource),
    ...groupAssignedPolicies(tenantPolicies, resource),
  ];
}

/** directlyAssignedPolicies selects the principal's own policies for resource, an exact match overriding the wildcard ones. */
function directlyAssignedPolicies(
  policies: Policy[],
  resource: ResourceId,
): Policy[] {
  const direct = policies.filter((p) => !isGroupPolicy(p));
  const exactPolicies = direct.filter(namesResource(resource));
  const wildcardPolicies = direct.filter(namesWildcardOf(resource));

  const hasExactPolicy = exactPolicies.length > 0;
  if (hasExactPolicy) return exactPolicies;
  return wildcardPolicies;
}

/** groupAssignedPolicies selects every group policy for resource, exact and wildcard, so groups only add access. */
function groupAssignedPolicies(
  policies: Policy[],
  resource: ResourceId,
): Policy[] {
  return policies
    .filter(isGroupPolicy)
    .filter(namesResourceOrWildcard(resource));
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

/** namesResource matches a policy that lists resource itself. */
const namesResource = (resource: ResourceId) => (p: Policy) =>
  p.resources.includes(resource);

/** namesWildcardOf matches a policy that lists the wildcard of resource's kind, `project/*` or `organization/*`. */
const namesWildcardOf = (resource: ResourceId) => (p: Policy) =>
  p.resources.includes(
    hasProjectKind(resource) ? wildcardProjectId : wildcardOrgId,
  );

/** namesResourceOrWildcard matches a policy that lists resource or its wildcard. */
const namesResourceOrWildcard = (resource: ResourceId) => (p: Policy) =>
  namesResource(resource)(p) || namesWildcardOf(resource)(p);

/** isGroupPolicy matches a policy granted through a group. */
const isGroupPolicy = (p: Policy) =>
  !!p.principalId && hasGroupKind(p.principalId);

const byAction = (action: Action) => (p: Policy) =>
  (p.actions as readonly string[]).includes(action);

const byEffect = (effect: Effect) => (p: Policy) => p.effect === effect;
