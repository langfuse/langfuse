import { CodeXml } from "@langfuse/icons";

import { type SystemRole } from "@langfuse/shared/src/db";
import { apiKeyRolesForScope } from "@langfuse/shared/rbac";

import { withoutGatewayRole } from "@/src/features/ai-gateway/fns/separateGatewayApiKeys";
import { type ResourceKind } from "@/src/features/rbac/components/RolePermissionList";
import {
  roleDisplay,
  type RoleDisplay,
} from "@/src/features/rbac/components/roleDisplay";

/** apiKeyRoleGrowthNote tells readers that a named role's permissions grow with the product. */
export const apiKeyRoleGrowthNote =
  "Permissions may be added as new features roll out.";

/** apiKeyRoleOrder lists the roles shown first in the picker; the rest follow in catalog order. */
const apiKeyRoleOrder: SystemRole[] = ["ADMIN", "VIEWER", "MEMBER"];

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

/** apiKeyRolesOfferedForScope lists the roles the create dialog offers for a scope, in picker order. */
export function apiKeyRolesOfferedForScope(scope: ApiKeyScope): SystemRole[] {
  return sortApiKeyRoles(withoutGatewayRole(apiKeyRolesForScope(scope)));
}

/** apiKeyResourceKinds lists the permission kinds a key of a scope holds; project keys hold only project permissions. */
export function apiKeyResourceKinds(scope: ApiKeyScope): ResourceKind[] {
  if (scope === "project") return ["project"];
  return ["organization", "project"];
}

/** apiKeyPermissionSetDisplay presents an offered role, or undefined for an unnamed legacy permission set. */
export function apiKeyPermissionSetDisplay(
  role: SystemRole,
  scope: ApiKeyScope,
): RoleDisplay | undefined {
  if (!apiKeyRolesOfferedForScope(scope).includes(role)) return undefined;
  return apiKeyRoleDisplay(role);
}

/** apiKeyPermissionPopupDisplay presents a named role with the growth note, and titles a legacy permission set as plain "Permissions". */
export function apiKeyPermissionPopupDisplay(
  role: SystemRole,
  scope: ApiKeyScope,
): { name: string; Icon?: RoleDisplay["Icon"]; note?: string } {
  const permissionSet = apiKeyPermissionSetDisplay(role, scope);
  if (!permissionSet) return { name: "Permissions" };
  return { ...permissionSet, note: apiKeyRoleGrowthNote };
}

/** sortApiKeyRoles puts apiKeyRoleOrder roles first, keeping catalog order for the rest. */
function sortApiKeyRoles(roles: SystemRole[]): SystemRole[] {
  const rank = (role: SystemRole) => {
    const index = apiKeyRoleOrder.indexOf(role);
    if (index === -1) return apiKeyRoleOrder.length;
    return index;
  };
  return [...roles].sort((a, b) => rank(a) - rank(b));
}

type ApiKeyScope = "project" | "organization";
