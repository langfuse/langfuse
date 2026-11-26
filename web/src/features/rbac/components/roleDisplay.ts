import { type IconComponent } from "@langfuse/icons";

import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { roleIcons } from "@/src/features/rbac/components/roleIcons";

export const roleName = (role: SystemRole) => systemRoleAccessRights[role].name;

/** roleDisplay is a role's catalog name, description, and icon. */
export const roleDisplay = (role: SystemRole): RoleDisplay => ({
  name: roleName(role),
  description: systemRoleAccessRights[role].description,
  Icon: roleIcons[role],
});

/** RoleDisplay is how a role is presented in role pickers and permission popups. */
export type RoleDisplay = {
  name: string;
  description: string;
  Icon: IconComponent;
};
