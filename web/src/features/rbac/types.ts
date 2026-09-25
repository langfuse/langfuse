import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type OwnerId,
  type PrincipalId,
  type RoleId,
  type TenantId,
} from "@langfuse/shared";

import { type Policy } from "@/src/features/auth/policy/types";

export { ApiKeyId, OrganizationId, ProjectId, SystemRoleId };
export type { OwnerId, PrincipalId, RoleId, TenantId };

/** Role is a named, tenant-scoped bundle of policies. */
export type Role = {
  id: RoleId;
  tenantId: TenantId;
  name: string;
  description: string;
  policies: Policy[];
  tags: string[];
};
