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
 * One project's audit log, or with `projectId: null` the organisation-level
 * events, which are stored with an empty `project_id`.
 */
type AuditLogScope = {
  orgId: string;
  projectId: string | null;
};

/** An audit log row as customer-facing reads return it. Empty values are `null`. */
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
  resourceRefs: string[];
  action: string;
  surface: string | null;
  route: string | null;
  params: string | null;
  resultCount: number;
  before: string | null;
  after: string | null;
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
  "resource_refs",
  "action",
  "surface",
  "route",
  "params",
  "result_count",
  "before",
  "after",
] as const satisfies readonly (keyof AuditLogRecordInsertType)[];

type AuditLogEntryRow = Pick<
  AuditLogRecordInsertType,
  (typeof AUDIT_LOG_ENTRY_COLUMNS)[number]
>;

// Events of users who acted through a support access grant are left out:
// they record Langfuse staff, not members of the organisation.
const AUDIT_LOG_SCOPE_CONDITION = `
  org_id = {orgId: String}
  AND project_id = {projectId: String}
  AND support_access = false
`;

const toScopeParams = ({ orgId, projectId }: AuditLogScope) => ({
  orgId,
  projectId: projectId ?? "",
});

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
  resourceRefs: row.resource_refs,
  action: row.action,
  surface: emptyToNull(row.surface),
  route: emptyToNull(row.route),
  params: emptyToNull(row.params),
  resultCount: Number(row.result_count),
  before: emptyToNull(row.before),
  after: emptyToNull(row.after),
});

/**
 * Change and access events of one scope, newest first, ordered by
 * `(timestamp, id)`. Page with `offset`, or with `after` set to the last row
 * of the previous page.
 */
export async function getAuditLogs(
  args: AuditLogScope & {
    limit: number;
    offset?: number;
    after?: { timestamp: Date; id: string };
    // Only events older than this.
    timestampBefore?: Date;
  },
): Promise<AuditLogEntry[]> {
  const rows = await queryClickhouse<AuditLogEntryRow>({
    query: `
      SELECT ${AUDIT_LOG_ENTRY_COLUMNS.join(", ")}
      FROM audit_logs
      WHERE ${AUDIT_LOG_SCOPE_CONDITION}
      ${args.timestampBefore ? "AND timestamp < {timestampBefore: DateTime64(3)}" : ""}
      ${args.after ? "AND (timestamp, id) < ({afterTimestamp: DateTime64(3)}, {afterId: String})" : ""}
      ORDER BY timestamp DESC, id DESC
      LIMIT {limit: Int32}
      ${args.offset ? "OFFSET {offset: Int32}" : ""}
    `,
    params: {
      ...toScopeParams(args),
      limit: args.limit,
      ...(args.offset ? { offset: args.offset } : {}),
      ...(args.timestampBefore
        ? {
            timestampBefore: convertDateToClickhouseDateTime(
              args.timestampBefore,
            ),
          }
        : {}),
      ...(args.after
        ? {
            afterTimestamp: convertDateToClickhouseDateTime(
              args.after.timestamp,
            ),
            afterId: args.after.id,
          }
        : {}),
    },
    tags: args.projectId ? { projectId: args.projectId } : undefined,
  });
  return rows.map(toAuditLogEntry);
}

export async function getAuditLogsCount(scope: AuditLogScope): Promise<number> {
  const rows = await queryClickhouse<{ count: string }>({
    query: `
      SELECT count() AS count
      FROM audit_logs
      WHERE ${AUDIT_LOG_SCOPE_CONDITION}
    `,
    params: toScopeParams(scope),
    tags: scope.projectId ? { projectId: scope.projectId } : undefined,
  });
  return Number(rows[0]?.count ?? 0);
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
