import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

export const roleName = (role: SystemRole) => systemRoleAccessRights[role].name;

/** roleDisplay is a role's catalog name and description. */
export const roleDisplay = (role: SystemRole): RoleDisplay => ({
  name: roleName(role),
  description: systemRoleAccessRights[role].description,
});

/** RoleDisplay is how a role is presented in role pickers and permission popups. */
export type RoleDisplay = {
  name: string;
  description: string;
};
