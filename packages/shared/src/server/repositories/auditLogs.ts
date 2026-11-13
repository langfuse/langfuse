/* eslint-disable @typescript-eslint/no-use-before-define */
import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { prisma, type AuditLogStaging, type Prisma } from "../../db";
import {
  AuditLogEventSchema,
  AuditLogStagingPayloadSchema,
  type AuditLogEvent,
  type AuditLogStagingPayload,
} from "../../domain/auditLogs";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import type { AuditLogRecordInsertType } from "./definitions";

export type StageAuditLogEventInput = AuditLogEvent & {
  // A UUID. Defaults to a new UUIDv7. Pass one to give another record the
  // same id.
  id?: string;
  // Defaults to now.
  timestamp?: Date;
};

/**
 * Writes audit events to `audit_log_staging` and returns their ids in input
 * order. Throws when an event is invalid or the insert fails, so a caller
 * that must not proceed without its audit row fails with it. Pass `tx` to
 * commit the rows together with the audited mutation.
 */
export async function stageAuditLogEvents(
  events: StageAuditLogEventInput[],
  tx?: Prisma.TransactionClient,
): Promise<string[]> {
  if (events.length === 0) return [];

  const rows = events.map(({ id, timestamp, ...event }) => {
    const payload: AuditLogStagingPayload = AuditLogEventSchema.parse(event);
    return {
      id: id ?? uuidv7(),
      createdAt: timestamp ?? new Date(),
      payload,
    };
  });

  await (tx ?? prisma).auditLogStaging.createMany({ data: rows });

  return rows.map((row) => row.id);
}

/**
 * The audit event id of a row in the Postgres `audit_logs` table, whose own
 * id is a cuid. It is a UUIDv7 that carries the row's `created_at` as its
 * timestamp and the first bits of a SHA-256 of the cuid as its random bits.
 * The same row therefore always maps to the same id, so the ClickHouse
 * `audit_logs` table collapses its copies.
 */
export function deriveAuditLogEventId(
  auditLogId: string,
  createdAt: Date,
): string {
  const timestampMs = createdAt.getTime();
  if (
    !Number.isInteger(timestampMs) ||
    timestampMs < 0 ||
    timestampMs >= 2 ** 48
  ) {
    throw new Error(`Audit log ${auditLogId} has an invalid created_at`);
  }

  const bytes = createHash("sha256").update(auditLogId).digest();
  bytes.writeUIntBE(timestampMs, 0, 6);
  // Version 7 in the high nibble of byte 6, the RFC 9562 variant (0b10) in
  // the top two bits of byte 8.
  bytes[6] = 0x70 + (bytes[6] % 0x10);
  bytes[8] = 0x80 + (bytes[8] % 0x40);

  const hex = bytes.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Maps a staging row to its ClickHouse `audit_logs` row. The staging row's
 * `created_at` is the event timestamp. Throws when the payload does not
 * match `AuditLogStagingPayloadSchema` or carries fields it does not know,
 * which a newer version may have staged, so that no field is dropped.
 */
export function convertAuditLogStagingRowToClickhouse(
  row: Pick<AuditLogStaging, "id" | "createdAt" | "payload">,
): AuditLogRecordInsertType {
  const event = AuditLogStagingPayloadSchema.parse(row.payload);
  const unknownFields = findDroppedFields(row.payload, event);
  if (unknownFields.length > 0) {
    throw new Error(
      `Staged audit event has unknown fields: ${unknownFields.join(", ")}`,
    );
  }
  const { actor } = event;

  return {
    id: row.id,
    timestamp: convertDateToClickhouseDateTime(row.createdAt),
    org_id: event.orgId,
    project_id: event.projectId ?? "",
    event_kind: event.kind,
    outcome: event.outcome,
    outcome_reason: event.outcomeReason ?? "",
    actor_type: actor.type,
    user_id: actor.type === "SYSTEM" ? "" : (actor.userId ?? ""),
    api_key_id: actor.type === "API_KEY" ? actor.apiKeyId : "",
    actor_name: actor.name ?? "",
    actor_email: actor.type === "SYSTEM" ? "" : (actor.email ?? ""),
    user_org_role: actor.type === "USER" ? (actor.orgRole ?? "") : "",
    user_project_role: actor.type === "USER" ? (actor.projectRole ?? "") : "",
    support_access: actor.type === "USER" && actor.supportAccess === true,
    resource_type: event.resourceType,
    resource_id: event.resourceId ?? "",
    resource_refs: event.resourceRefs,
    action: event.action,
    surface: event.surface ?? "",
    route: event.route ?? "",
    params: event.kind === "access" ? (event.params ?? "") : "",
    result_count: event.kind === "access" ? (event.resultCount ?? 0) : 0,
    before: event.kind === "change" ? (event.before ?? "") : "",
    after: event.kind === "change" ? (event.after ?? "") : "",
    ip: event.request?.ip ?? "",
    user_agent: event.request?.userAgent ?? "",
    request_id: event.request?.requestId ?? "",
  };
}

/**
 * One project's audit log, or one organisation's organisation-level events,
 * which are stored with an empty `project_id`. Project events are matched on
 * `project_id` alone: each event keeps the `org_id` it was written with, so a
 * project moved to another organisation keeps its earlier history.
 */
type AuditLogScope = { projectId: string } | { orgId: string; projectId: null };

/** An audit log row as the viewer lists it. Empty values are `null`. */
export type AuditLogEntry = {
  id: string;
  timestamp: Date;
  orgId: string;
  projectId: string | null;
  eventKind: AuditLogRecordInsertType["event_kind"];
  outcome: AuditLogRecordInsertType["outcome"];
  outcomeReason: string | null;
  actorType: AuditLogRecordInsertType["actor_type"];
  userId: string | null;
  apiKeyId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  userOrgRole: string | null;
  userProjectRole: string | null;
  resourceType: string;
  resourceId: string | null;
  action: string;
  surface: string | null;
  route: string | null;
  resultCount: number;
  before: string | null;
  after: string | null;
};

/**
 * An audit log row as the export writes it. It adds the access details,
 * which the viewer leaves out: one access event can carry thousands of
 * resource refs.
 */
type AuditLogExportEntry = AuditLogEntry & {
  resourceRefs: string[];
  params: string | null;
};

const AUDIT_LOG_ENTRY_COLUMNS = [
  "id",
  "timestamp",
  "org_id",
  "project_id",
  "event_kind",
  "outcome",
  "outcome_reason",
  "actor_type",
  "user_id",
  "api_key_id",
  "actor_name",
  "actor_email",
  "user_org_role",
  "user_project_role",
  "resource_type",
  "resource_id",
  "action",
  "surface",
  "route",
  "result_count",
  "before",
  "after",
] as const satisfies readonly (keyof AuditLogRecordInsertType)[];

const AUDIT_LOG_EXPORT_COLUMNS = [
  ...AUDIT_LOG_ENTRY_COLUMNS,
  "resource_refs",
  "params",
] as const satisfies readonly (keyof AuditLogRecordInsertType)[];

type AuditLogEntryRow = Pick<
  AuditLogRecordInsertType,
  (typeof AUDIT_LOG_ENTRY_COLUMNS)[number]
>;

type AuditLogExportRow = Pick<
  AuditLogRecordInsertType,
  (typeof AUDIT_LOG_EXPORT_COLUMNS)[number]
>;

// Events of users who acted through a support access grant are left out:
// they record Langfuse staff, not members of the organisation.
const toScopeFilter = (scope: AuditLogScope) =>
  scope.projectId !== null
    ? {
        condition:
          "project_id = {projectId: String} AND support_access = false",
        params: { projectId: scope.projectId },
        tags: { projectId: scope.projectId },
      }
    : {
        condition:
          "org_id = {orgId: String} AND project_id = '' AND support_access = false",
        params: { orgId: scope.orgId },
        tags: undefined,
      };

const emptyToNull = (value: string) => (value === "" ? null : value);

const toAuditLogEntry = (row: AuditLogEntryRow): AuditLogEntry => ({
  id: row.id,
  timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
  orgId: row.org_id,
  projectId: emptyToNull(row.project_id),
  eventKind: row.event_kind,
  outcome: row.outcome,
  outcomeReason: emptyToNull(row.outcome_reason),
  actorType: row.actor_type,
  userId: emptyToNull(row.user_id),
  apiKeyId: emptyToNull(row.api_key_id),
  actorName: emptyToNull(row.actor_name),
  actorEmail: emptyToNull(row.actor_email),
  userOrgRole: emptyToNull(row.user_org_role),
  userProjectRole: emptyToNull(row.user_project_role),
  resourceType: row.resource_type,
  resourceId: emptyToNull(row.resource_id),
  action: row.action,
  surface: emptyToNull(row.surface),
  route: emptyToNull(row.route),
  resultCount: Number(row.result_count),
  before: emptyToNull(row.before),
  after: emptyToNull(row.after),
});

/** One page of the change and access events of a scope, newest first. */
export async function getAuditLogs(
  args: AuditLogScope & { limit: number; offset: number },
): Promise<AuditLogEntry[]> {
  const scope = toScopeFilter(args);
  const rows = await queryClickhouse<AuditLogEntryRow>({
    query: `
      SELECT ${AUDIT_LOG_ENTRY_COLUMNS.join(", ")}
      FROM audit_logs
      WHERE ${scope.condition}
      ORDER BY timestamp DESC, id DESC
      LIMIT {limit: Int32} OFFSET {offset: Int32}
    `,
    params: { ...scope.params, limit: args.limit, offset: args.offset },
    tags: scope.tags,
  });
  return rows.map(toAuditLogEntry);
}

export async function getAuditLogsCount(scope: AuditLogScope): Promise<number> {
  const { condition, params, tags } = toScopeFilter(scope);
  const rows = await queryClickhouse<{ count: string }>({
    query: `
      SELECT count() AS count
      FROM audit_logs
      WHERE ${condition}
    `,
    params,
    tags,
  });
  return Number(rows[0]?.count ?? 0);
}

/**
 * One page of a project's audit log export: events older than
 * `timestampBefore`, newest first by `(timestamp, id)`. Pass the last row of
 * the previous page as `after`.
 */
export async function getAuditLogsForExport(args: {
  projectId: string;
  limit: number;
  timestampBefore: Date;
  after?: { timestamp: Date; id: string };
}): Promise<AuditLogExportEntry[]> {
  const scope = toScopeFilter({ projectId: args.projectId });
  const rows = await queryClickhouse<AuditLogExportRow>({
    query: `
      SELECT ${AUDIT_LOG_EXPORT_COLUMNS.join(", ")}
      FROM audit_logs
      WHERE ${scope.condition}
      AND timestamp < {timestampBefore: DateTime64(3)}
      ${
        // The plain timestamp bound is redundant with the tuple comparison
        // but lets ClickHouse prune partitions and the primary key, which it
        // does not do for a tuple comparison.
        args.after
          ? "AND (timestamp, id) < ({afterTimestamp: DateTime64(3)}, {afterId: String}) AND timestamp <= {afterTimestamp: DateTime64(3)}"
          : ""
      }
      ORDER BY timestamp DESC, id DESC
      LIMIT {limit: Int32}
    `,
    params: {
      ...scope.params,
      limit: args.limit,
      timestampBefore: convertDateToClickhouseDateTime(args.timestampBefore),
      ...(args.after
        ? {
            afterTimestamp: convertDateToClickhouseDateTime(
              args.after.timestamp,
            ),
            afterId: args.after.id,
          }
        : {}),
    },
    tags: scope.tags,
  });
  return rows.map((row) => ({
    ...toAuditLogEntry(row),
    resourceRefs: row.resource_refs,
    params: emptyToNull(row.params),
  }));
}

/**
 * Returns the dotted paths of object keys in `input` that are missing from
 * `parsed`, i.e. the keys a zod object schema stripped while parsing.
 */
function findDroppedFields(
  input: unknown,
  parsed: unknown,
  path = "",
): string[] {
  if (!isRecord(input) || !isRecord(parsed)) return [];
  return Object.keys(input).flatMap((key) => {
    const keyPath = path === "" ? key : `${path}.${key}`;
    return key in parsed
      ? findDroppedFields(input[key], parsed[key], keyPath)
      : [keyPath];
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
