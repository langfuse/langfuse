import {
  type ResourceId,
  type RoleId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { matchesResource } from "@/src/features/rbac/authorize";

/** rolesFor lists the roles whose policies govern resource in tenant, an exact resource match taking precedence over a wildcard. */
export function rolesFor(
  authCtx: Pick<AuthorizationContext, "policies">,
  tenant: TenantId,
  resource: ResourceId,
): RoleId[] {
  const roleIds = authCtx.policies.flatMap((policies) =>
    matchesResource(policies, tenant, resource).map((policy) => policy.roleId),
  );
  return [...new Set(roleIds)];
}
