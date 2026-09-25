import { projectScopes, type ProjectScope } from "@langfuse/shared";
import {
  type ResourceId,
  type RoleId,
  type TenantId,
} from "@langfuse/shared/rbac";
import { type SystemRole } from "@langfuse/shared/src/db";

import {
  organizationScopes,
  type OrganizationScope,
} from "@/src/features/rbac/constants/organizationAccessRights";

/** allProjectActions is the full project action vocabulary. */
export const allProjectActions: ProjectAction[] = [...projectScopes];

/** allOrganizationActions is the full organization action vocabulary. */
export const allOrganizationActions: OrganizationAction[] = [
  ...organizationScopes,
];

/** organizationActionSet is allOrganizationActions indexed for membership tests. */
const organizationActionSet: ReadonlySet<string> = new Set(organizationScopes);

/** isOrgAction reports whether an action belongs to the disjoint org vocabulary. */
export const isOrgAction = (action: Action): action is OrganizationAction =>
  organizationActionSet.has(action);

/** Effect is whether a policy grants or denies its actions. */
export type Effect = "ALLOW" | "DENY";

/** ProjectAction is an action assignable to a project policy. */
export type ProjectAction = ProjectScope;

/** OrganizationAction is an action assignable to an organization policy. */
export type OrganizationAction = OrganizationScope;

/** Action is any checkable action. */
export type Action = ProjectAction | OrganizationAction;

/** SystemRolePolicy is a catalog policy before its resource is bound. */
export type SystemRolePolicy =
  | {
      resourceKind: "organization";
      actions: OrganizationAction[];
      effect: Effect;
    }
  | { resourceKind: "project"; actions: ProjectAction[]; effect: Effect };

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

/** SystemRolePrincipalTag marks the principal kind a system role is intended for. */
type SystemRolePrincipalTag = "principal:apiKey" | "principal:user";

/** SystemRoleDefinition is an in-code system role's catalog entry: metadata plus its resource-less policies. */
export type SystemRoleDefinition = {
  id: SystemRole;
  name: string;
  description: string;
  policies: SystemRolePolicy[];
  tags: SystemRolePrincipalTag[];
};
