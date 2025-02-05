import { type AuditableResource } from "@/src/features/audit-logs/auditLog";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import {
  ACTION_ACCESS_MAP,
  type ActionId,
  type BatchActionTableName,
} from "@langfuse/shared";

const tableNameToResourceType: Record<BatchActionTableName, AuditableResource> =
  {
    traces: "trace",
    // Add other table names from BulkSelectTableName enum
  } as const;

export const getServerActionConfig = (
  actionId: ActionId,
  tableName: BatchActionTableName,
): {
  type: "delete" | "create";
  resourceType: AuditableResource;
  scope: ProjectScope;
  entitlement?: Entitlement;
} => {
  return {
    ...ACTION_ACCESS_MAP[actionId],
    resourceType: tableNameToResourceType[tableName],
  };
};
