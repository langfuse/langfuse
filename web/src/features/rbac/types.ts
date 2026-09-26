import {
  type Action,
  type Effect,
  type ResourceId,
  type RoleId,
  type TenantId,
} from "@langfuse/shared/rbac";

/** Policy is a role's effect on a set of actions over tagged resources within one tenant. */
export type Policy = {
  id: string;
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
