import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import {
  prisma,
  type AuditLog,
  type AuditLogStaging,
  type Prisma,
} from "../../db";
import {
  AuditLogEventSchema,
  AuditLogStagingPayloadSchema,
  type AuditLogActor,
  type AuditLogEvent,
  type AuditLogStagingPayload,
} from "../../domain/auditLogs";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
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
    resourceRefs: [],
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

// Writes made by Langfuse itself rather than by a user or an API key carry
// these sentinel actor ids. The Postgres `audit_logs` row keeps them, because
// its actor type cannot be SYSTEM. The audit event records a SYSTEM actor.
const SYSTEM_ACTOR_USER_IDS = new Set(["stripe-webhook", "clickhouse-webhook"]);
const ADMIN_API_KEY_IDS = new Set(["ADMIN_KEY", "ADMIN_API_KEY"]);

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
