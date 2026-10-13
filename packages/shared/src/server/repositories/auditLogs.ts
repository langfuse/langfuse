import { v7 as uuidv7 } from "uuid";
import { prisma, type AuditLogStaging, type Prisma } from "../../db";
import {
  AuditLogEventSchema,
  AuditLogStagingPayloadSchema,
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
 * Maps a staging row to its ClickHouse `audit_logs` row. The staging row's
 * `created_at` is the event timestamp. Throws when the payload does not
 * match `AuditLogStagingPayloadSchema`.
 */
export function convertAuditLogStagingRowToClickhouse(
  row: Pick<AuditLogStaging, "id" | "createdAt" | "payload">,
): AuditLogRecordInsertType {
  const event = AuditLogStagingPayloadSchema.parse(row.payload);
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
