import type { AuditLog } from "../../db";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import type { AuditLogRecordInsertType } from "./definitions";

/**
 * The fields of a Postgres audit log row that the ClickHouse twin is built
 * from. A stored `AuditLog` satisfies it, and so does the row the web dual
 * write assembles before it inserts, which is why nullable columns may also be
 * `undefined` here.
 */
export type AuditLogChangeRow = Pick<
  AuditLog,
  | "id"
  | "createdAt"
  | "orgId"
  | "type"
  | "resourceType"
  | "resourceId"
  | "action"
> & {
  projectId?: string | null;
  userId?: string | null;
  apiKeyId?: string | null;
  userOrgRole?: string | null;
  userProjectRole?: string | null;
  before?: string | null;
  after?: string | null;
};

/**
 * Maps a Postgres audit log row to its ClickHouse change-event twin. The web
 * dual-write and the backfill both go through here so both produce byte-equal
 * rows and ReplacingMergeTree collapses them into one.
 */
export function convertPostgresAuditLogToClickhouse(
  row: AuditLogChangeRow,
): AuditLogRecordInsertType {
  return {
    id: row.id,
    timestamp: convertDateToClickhouseDateTime(row.createdAt),
    org_id: row.orgId,
    project_id: row.projectId ?? "",
    event_kind: "change",
    actor_type: row.type,
    user_id: row.userId ?? "",
    api_key_id: row.apiKeyId ?? "",
    user_org_role: row.userOrgRole ?? "",
    user_project_role: row.userProjectRole ?? "",
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    action: row.action,
    surface: "",
    route: "",
    params: "",
    result_count: 0,
    before: row.before ?? "",
    after: row.after ?? "",
  };
}
