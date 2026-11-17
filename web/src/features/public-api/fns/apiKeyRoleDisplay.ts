import { CodeXml } from "@langfuse/icons";

import { type SystemRole } from "@langfuse/shared/src/db";
import { apiKeyRolesForScope } from "@langfuse/shared/rbac";

import { withoutGatewayRole } from "@/src/features/ai-gateway/fns/separateGatewayApiKeys";
import { rolePermissionCount } from "@/src/features/rbac/components/RolePermissionList";
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

/** apiKeyRolesOfferedForScope lists the roles the create dialog offers for a scope, most permissions first. */
export function apiKeyRolesOfferedForScope(scope: ApiKeyScope): SystemRole[] {
  return sortApiKeyRoles(withoutGatewayRole(apiKeyRolesForScope(scope)));
}

/** apiKeyPermissionSetDisplay presents an offered role, or undefined for an unnamed legacy permission set. */
export function apiKeyPermissionSetDisplay(
  role: SystemRole,
  scope: ApiKeyScope,
): RoleDisplay | undefined {
  if (!apiKeyRolesOfferedForScope(scope).includes(role)) return undefined;
  return apiKeyRoleDisplay(role);
}

/** sortApiKeyRoles orders roles by permission count, descending, keeping catalog order for ties. */
function sortApiKeyRoles(roles: SystemRole[]): SystemRole[] {
  return [...roles].sort(
    (a, b) => rolePermissionCount(b) - rolePermissionCount(a),
  );
}

type ApiKeyScope = "project" | "organization";
