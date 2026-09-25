import { type RoleId, type TenantId } from "@langfuse/shared/rbac";

import { type Policy } from "@/src/features/auth/policy/types";

/** Role is a named, tenant-scoped bundle of policies. */
export type Role = {
  id: RoleId;
  tenantId: TenantId;
  name: string;
  description: string;
  policies: Policy[];
  tags: string[];
};
