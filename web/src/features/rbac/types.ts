import {
  type Action,
  type Effect,
  type PrincipalId,
  type ResourceId,
  type RoleId,
  type TenantId,
} from "@langfuse/shared/rbac";

/** Policy is a role's effect on a set of actions over tagged resources within one tenant, granted to one principal. */
export type Policy = {
  id: string;
  principalId?: PrincipalId;
  tenantId: TenantId;
  roleId: RoleId;
  effect: Effect;
  actions: Action[];
  resources: ResourceId[];
};

/** Role is a named, tenant-scoped bundle of policies. */
export type Role = {
  id: RoleId;
  tenantId: TenantId;
  name: string;
  description: string;
  policies: Policy[];
  tags: string[];
};
