import { type ColumnDefinition } from "./types";

export const auditLogEventKinds = ["change", "access"] as const;
export const auditLogActorTypes = ["USER", "API_KEY"] as const;
export const auditLogSurfaces = ["trpc", "public-api"] as const;

/**
 * Filterable columns of the audit log table. `internal` names the ClickHouse
 * column; the ClickHouse mapping lives in `mapAuditLogsTable`.
 */
export const auditLogsTableCols: ColumnDefinition[] = [
  {
    name: "Timestamp",
    id: "timestamp",
    type: "datetime",
    internal: "timestamp",
  },
  {
    name: "Event Kind",
    id: "eventKind",
    type: "stringOptions",
    internal: "event_kind",
    options: auditLogEventKinds.map((value) => ({ value })),
  },
  {
    name: "Actor Type",
    id: "actorType",
    type: "stringOptions",
    internal: "actor_type",
    options: auditLogActorTypes.map((value) => ({ value })),
  },
  {
    name: "User ID",
    id: "userId",
    type: "string",
    internal: "user_id",
  },
  {
    name: "API Key ID",
    id: "apiKeyId",
    type: "string",
    internal: "api_key_id",
  },
  {
    name: "Resource Type",
    id: "resourceType",
    type: "string",
    internal: "resource_type",
  },
  {
    name: "Resource ID",
    id: "resourceId",
    type: "string",
    internal: "resource_id",
  },
  {
    name: "Action",
    id: "action",
    type: "string",
    internal: "action",
  },
  {
    name: "Surface",
    id: "surface",
    type: "stringOptions",
    internal: "surface",
    options: auditLogSurfaces.map((value) => ({ value })),
  },
  {
    name: "Route",
    id: "route",
    type: "string",
    internal: "route",
  },
];
