import { type UiColumnMappings } from "../../tableDefinitions";

const column = (
  uiTableName: string,
  uiTableId: string,
  clickhouseSelect: string,
) => ({
  uiTableName,
  uiTableId,
  clickhouseTableName: "audit_logs",
  clickhouseSelect,
});

export const auditLogsTableUiColumnDefinitions: UiColumnMappings = [
  column("Timestamp", "timestamp", "timestamp"),
  column("Event Kind", "eventKind", "event_kind"),
  column("Actor Type", "actorType", "actor_type"),
  column("User ID", "userId", "user_id"),
  column("API Key ID", "apiKeyId", "api_key_id"),
  column("Resource Type", "resourceType", "resource_type"),
  column("Resource ID", "resourceId", "resource_id"),
  column("Action", "action", "action"),
  column("Surface", "surface", "surface"),
  column("Route", "route", "route"),
];
