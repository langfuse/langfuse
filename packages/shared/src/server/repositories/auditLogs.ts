import type { ClickHouseClientConfigOptions } from "@clickhouse/client";
import type { AuditLog } from "../../db";
import type { FilterState } from "../../types";
import { auditLogsTableCols } from "../../tableDefinitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  FilterList,
  StringFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { auditLogsTableUiColumnDefinitions } from "../tableMappings/mapAuditLogsTable";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import type {
  AuditLogActorType,
  AuditLogEventKind,
  AuditLogRecordInsertType,
  AuditLogRecordReadType,
} from "./definitions";

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

/**
 * An audit log row as the read path hands it out. Empty ClickHouse strings
 * become `null` so consumers keep the nullable shape of the former Postgres
 * model; `createdAt` mirrors the event timestamp for the same reason.
 */
export type AuditLogEntry = {
  id: string;
  createdAt: Date;
  eventKind: AuditLogEventKind;
  type: AuditLogActorType;
  apiKeyId: string | null;
  userId: string | null;
  orgId: string;
  userOrgRole: string | null;
  projectId: string | null;
  userProjectRole: string | null;
  resourceType: string;
  resourceId: string;
  action: string;
  surface: string | null;
  route: string | null;
  params: string | null;
  resultCount: number;
  before: string | null;
  after: string | null;
};

const emptyToNull = (value: string) => (value === "" ? null : value);

export function convertClickhouseToAuditLogEntry(
  row: AuditLogRecordReadType,
): AuditLogEntry {
  return {
    id: row.id,
    createdAt: parseClickhouseUTCDateTimeFormat(row.timestamp),
    eventKind: row.event_kind,
    type: row.actor_type,
    apiKeyId: emptyToNull(row.api_key_id),
    userId: emptyToNull(row.user_id),
    orgId: row.org_id,
    userOrgRole: emptyToNull(row.user_org_role),
    projectId: emptyToNull(row.project_id),
    userProjectRole: emptyToNull(row.user_project_role),
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    action: row.action,
    surface: emptyToNull(row.surface),
    route: emptyToNull(row.route),
    params: emptyToNull(row.params),
    resultCount: Number(row.result_count),
    before: emptyToNull(row.before),
    after: emptyToNull(row.after),
  };
}

/**
 * Selects one organisation's audit log. `projectId: null` returns the
 * organisation-level rows only (stored with an empty `project_id`).
 */
export type AuditLogScope = {
  orgId: string;
  projectId: string | null;
};

type AuditLogQueryArgs = AuditLogScope & {
  filter?: FilterState;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
};

const buildScopeFilter = ({ orgId, projectId, filter }: AuditLogQueryArgs) => {
  const filters = new FilterList([
    new StringFilter({
      clickhouseTable: "audit_logs",
      field: "org_id",
      operator: "=",
      value: orgId,
    }),
    new StringFilter({
      clickhouseTable: "audit_logs",
      field: "project_id",
      operator: "=",
      value: projectId ?? "",
    }),
  ]);
  if (filter && filter.length > 0) {
    filters.push(
      ...createFilterFromFilterState(
        filter,
        auditLogsTableUiColumnDefinitions,
        auditLogsTableCols,
      ),
    );
  }
  return filters.apply();
};

const tagsFor = ({ orgId, projectId }: AuditLogScope, kind: string) => ({
  feature: "audit-logs",
  type: "audit_logs",
  kind,
  orgId,
  ...(projectId ? { projectId } : {}),
});

/**
 * Newest first. Rows are collapsed by id in the query because the dual write
 * and the backfill can leave a duplicate in an unmerged part for a while.
 */
export async function getAuditLogs(
  args: AuditLogQueryArgs & { limit: number; offset: number },
): Promise<AuditLogEntry[]> {
  const scope = buildScopeFilter(args);
  const rows = await queryClickhouse<AuditLogRecordReadType>({
    query: `
      SELECT
        id,
        timestamp,
        org_id,
        project_id,
        event_kind,
        actor_type,
        user_id,
        api_key_id,
        user_org_role,
        user_project_role,
        resource_type,
        resource_id,
        action,
        surface,
        route,
        params,
        result_count,
        before,
        after
      FROM audit_logs
      WHERE ${scope.query}
      ORDER BY timestamp DESC, id DESC
      LIMIT 1 BY id
      LIMIT {limit: Int32} OFFSET {offset: Int32}
    `,
    params: { ...scope.params, limit: args.limit, offset: args.offset },
    tags: tagsFor(args, "list"),
    clickhouseConfigs: args.clickhouseConfigs,
  });
  return rows.map(convertClickhouseToAuditLogEntry);
}

export async function getAuditLogsCount(
  args: AuditLogQueryArgs,
): Promise<number> {
  const scope = buildScopeFilter(args);
  const rows = await queryClickhouse<{ count: string }>({
    query: `
      SELECT uniqExact(id) AS count
      FROM audit_logs
      WHERE ${scope.query}
    `,
    params: scope.params,
    tags: tagsFor(args, "count"),
    clickhouseConfigs: args.clickhouseConfigs,
  });
  return Number(rows[0]?.count ?? 0);
}
