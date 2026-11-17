/* eslint-disable @typescript-eslint/no-use-before-define */
import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import {
  prisma,
  type AuditLog,
  type AuditLogStaging,
  type Prisma,
} from "../../db";
import {
  AuditLogEventSchema,
  AuditLogStagingPayloadSchema,
  AUDIT_LOG_RESOURCE_REFS_MAX,
  toAuditLogResourceRef,
  type AuditLogActor,
  type AuditLogEvent,
  type AuditLogStagingPayload,
  type AuditLogResourceRef,
} from "../../domain/auditLogs";
import {
  convertDateToClickhouseDateTime,
  type PreferredClickhouseService,
} from "../clickhouse/client";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import type { AuditLogRecordInsertType } from "./definitions";

// Writes made by Langfuse itself rather than by a user or an API key carry
// these sentinel actor ids. The Postgres `audit_logs` row keeps them, because
// its actor type cannot be SYSTEM. The audit event records a SYSTEM actor.
const SYSTEM_ACTOR_USER_IDS = new Set([
  "stripe-webhook",
  "clickhouse-webhook",
  "conductorone-webhook",
]);
const ADMIN_API_KEY_IDS = new Set(["ADMIN_KEY", "ADMIN_API_KEY"]);

const BulkTraceDeletionSnapshotSchema = z.object({
  traceIds: z.array(z.string()).max(AUDIT_LOG_RESOURCE_REFS_MAX),
});

/** Derives queryable refs from the durable snapshot for live writes and replay. */
export function getAuditLogResourceRefs(
  log: Pick<AuditLog, "resourceType" | "action"> & { before?: unknown },
): AuditLogResourceRef[] {
  if (log.resourceType !== "project" || log.action !== "deleteTraces") {
    return [];
  }

  let snapshot = log.before;
  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      return [];
    }
  }
  const parsed = BulkTraceDeletionSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return [];

  return Array.from(
    new Set(
      parsed.data.traceIds
        .filter((id) => id.length > 0)
        .map((id) =>
          id.replaceAll("\u0000", String.fromCharCode(0xfffd)).toWellFormed(),
        ),
    ),
    (id) => toAuditLogResourceRef("trace", id),
  );
}

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
  return toAuditLogRecord(row.id, row.createdAt, event);
}

/**
 * Maps a row of the Postgres `audit_logs` table to its ClickHouse
 * `audit_logs` row. It equals the row `auditLog()` stages for the same record,
 * except that the actor has no name or email, which the Postgres row does not
 * keep. Throws when the row has no valid actor.
 */
export function convertPostgresAuditLogToClickhouse(
  row: Pick<
    AuditLog,
    | "id"
    | "createdAt"
    | "type"
    | "userId"
    | "apiKeyId"
    | "userOrgRole"
    | "userProjectRole"
    | "orgId"
    | "projectId"
    | "resourceType"
    | "resourceId"
    | "action"
    | "before"
    | "after"
  >,
): AuditLogRecordInsertType {
  const event = AuditLogStagingPayloadSchema.parse({
    kind: "change",
    orgId: row.orgId,
    projectId: row.projectId ?? undefined,
    actor: toPostgresAuditLogActor(row),
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    resourceRefs: getAuditLogResourceRefs(row),
    action: row.action,
    outcome: "success",
    // Serialized JSON in both stores.
    before: row.before ?? undefined,
    after: row.after ?? undefined,
  });
  return toAuditLogRecord(
    deriveAuditLogEventId(row.id, row.createdAt),
    row.createdAt,
    event,
  );
}

/** The SYSTEM actor that a sentinel user id stands for, if it is one. */
export function getSystemAuditLogActorForUserId(
  userId: string,
): AuditLogActor | undefined {
  return SYSTEM_ACTOR_USER_IDS.has(userId)
    ? { type: "SYSTEM", name: userId }
    : undefined;
}

/** The SYSTEM actor that a sentinel API key id stands for, if it is one. */
export function getSystemAuditLogActorForApiKeyId(
  apiKeyId: string,
): AuditLogActor | undefined {
  return ADMIN_API_KEY_IDS.has(apiKeyId)
    ? { type: "SYSTEM", name: "admin-api" }
    : undefined;
}

function toPostgresAuditLogActor(
  row: Pick<
    AuditLog,
    "id" | "type" | "userId" | "apiKeyId" | "userOrgRole" | "userProjectRole"
  >,
): AuditLogActor {
  if (row.type === "API_KEY") {
    if (!row.apiKeyId) {
      throw new Error(`Audit log ${row.id} is an API key row without a key`);
    }
    return (
      getSystemAuditLogActorForApiKeyId(row.apiKeyId) ?? {
        type: "API_KEY",
        apiKeyId: row.apiKeyId,
        // Set for an in-app agent key: the user it acts for.
        userId: row.userId ?? undefined,
      }
    );
  }

  if (!row.userId) {
    throw new Error(`Audit log ${row.id} is a user row without a user`);
  }
  return (
    getSystemAuditLogActorForUserId(row.userId) ?? {
      type: "USER",
      userId: row.userId,
      orgRole: row.userOrgRole ?? undefined,
      projectRole: row.userProjectRole ?? undefined,
    }
  );
}

function toAuditLogRecord(
  id: string,
  timestamp: Date,
  event: AuditLogStagingPayload,
): AuditLogRecordInsertType {
  const { actor } = event;

  return {
    id,
    timestamp: convertDateToClickhouseDateTime(timestamp),
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
 * events, which are stored with an empty `project_id`. Each event keeps the
 * `org_id` it was written with, so a project moved to another organisation
 * shows only the events recorded since it belongs to `orgId`.
 */
type AuditLogScope = { orgId: string; projectId: string | null };

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
const toScopeFilter = ({ orgId, projectId }: AuditLogScope) => ({
  condition: `
    org_id = {orgId: String}
    AND project_id = {projectId: String}
    AND support_access = false
  `,
  params: { orgId, projectId: projectId ?? "" },
  tags: projectId ? { projectId } : undefined,
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
  orgId: string;
  projectId: string;
  limit: number;
  timestampBefore: Date;
  after?: { timestamp: Date; id: string };
  preferredClickhouseService?: PreferredClickhouseService;
}): Promise<AuditLogExportEntry[]> {
  const scope = toScopeFilter(args);
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
    preferredClickhouseService: args.preferredClickhouseService,
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
