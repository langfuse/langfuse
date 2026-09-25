import { type RoleId, type TenantId } from "@langfuse/shared/rbac";
import { type SystemRole } from "@langfuse/shared/src/db";

import {
  type Policy,
  type SystemRolePolicy,
} from "@/src/features/auth/policy/types";

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
