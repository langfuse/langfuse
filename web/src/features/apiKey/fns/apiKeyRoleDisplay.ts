import { CodeXml } from "@langfuse/icons";

import { type SystemRole } from "@langfuse/shared/src/db";

import {
  roleDisplay,
  type RoleDisplay,
} from "@/src/features/rbac/components/roleDisplay";

/** apiKeyRoleOverrides presents user roles in api-key friendly terms. */
const apiKeyRoleOverrides: Partial<Record<SystemRole, Partial<RoleDisplay>>> = {
  ADMIN: { name: "Full access" },
  MEMBER: {
    name: "Developer",
    description:
      "Debug traces, build datasets and run experiments from the SDK.",
    Icon: CodeXml,
  },
};

/** apiKeyRoleDisplay presents a role with its api-key overrides applied. */
export function apiKeyRoleDisplay(role: SystemRole): RoleDisplay {
  return { ...roleDisplay(role), ...apiKeyRoleOverrides[role] };
}
