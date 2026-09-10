import { randomUUID } from "crypto";
import {
  AuditLogQueue,
  convertDateToClickhouseDateTime,
  logger,
  QueueJobs,
  recordIncrement,
  type AuditLogRecordInsertType,
} from "@langfuse/shared/src/server";

/** How a resource was accessed. Kept separate from change actions on purpose. */
export type AccessEventAction = "read" | "list" | "export" | "download";

/** Request surfaces that emit access events. */
type AccessEventSurface = "trpc" | "public-api";

type AccessEventActor =
  | {
      type: "USER";
      userId: string;
      orgRole?: string;
      projectRole?: string;
    }
  | {
      type: "API_KEY";
      apiKeyId: string;
      /** Set for in-app agent keys that act on behalf of a user. */
      userId?: string;
    };

export type AccessEvent = {
  actor: AccessEventActor;
  orgId: string;
  /** Empty for organisation-level reads. */
  projectId?: string;
  surface: AccessEventSurface;
  /** Stable handler identifier, e.g. the tRPC path or the REST route pattern. */
  route: string;
  resourceType: string;
  /** Set for single-entity reads; empty for lists. */
  resourceId?: string;
  action: AccessEventAction;
  /** The request's validated input or query; serialised and size-capped. */
  params: unknown;
  /** Number of entities returned. 0 when unknown or not applicable. */
  resultCount: number;
};

/**
 * Upper bound for the serialised `params` column. Larger inputs (e.g. huge
 * filter arrays) are replaced by a truncated preview so a single read can never
 * write an unbounded blob.
 */
export const ACCESS_EVENT_PARAMS_MAX_CHARS = 4096;

export function serializeAccessEventParams(params: unknown): string {
  if (params === undefined || params === null) return "";
  let serialized: string;
  try {
    serialized = JSON.stringify(params) ?? "";
  } catch {
    return JSON.stringify({ unserializable: true });
  }
  if (serialized.length <= ACCESS_EVENT_PARAMS_MAX_CHARS) return serialized;
  return JSON.stringify({
    truncated: true,
    originalLength: serialized.length,
    preview: serialized.slice(0, ACCESS_EVENT_PARAMS_MAX_CHARS),
  });
}

function buildAccessEventRecord(
  event: AccessEvent,
  now: Date = new Date(),
): AuditLogRecordInsertType {
  const actor = event.actor;
  return {
    id: randomUUID(),
    timestamp: convertDateToClickhouseDateTime(now),
    org_id: event.orgId,
    project_id: event.projectId ?? "",
    event_kind: "access",
    actor_type: actor.type,
    user_id: actor.userId ?? "",
    api_key_id: actor.type === "API_KEY" ? actor.apiKeyId : "",
    user_org_role: actor.type === "USER" ? (actor.orgRole ?? "") : "",
    user_project_role: actor.type === "USER" ? (actor.projectRole ?? "") : "",
    resource_type: event.resourceType,
    resource_id: event.resourceId ?? "",
    action: event.action,
    surface: event.surface,
    route: event.route,
    params: serializeAccessEventParams(event.params),
    result_count: Math.max(0, Math.floor(event.resultCount)),
    before: "",
    after: "",
  };
}

/**
 * Queues an access event for ClickHouse. Fails open: a read must never be
 * blocked by the audit trail, so enqueue problems are logged and counted but
 * not thrown.
 */
export async function recordAccessEvent(event: AccessEvent): Promise<void> {
  try {
    const queue = AuditLogQueue.getInstance();
    if (!queue) {
      recordIncrement("langfuse.audit_log.access_event_dropped", 1, {
        reason: "queue_unavailable",
      });
      return;
    }
    const record = buildAccessEventRecord(event);
    await queue.add(QueueJobs.AuditLogJob, {
      id: record.id,
      timestamp: new Date(),
      name: QueueJobs.AuditLogJob,
      payload: record,
    });
  } catch (error) {
    logger.error("Failed to enqueue audit log access event", {
      error,
      route: event.route,
      surface: event.surface,
    });
    recordIncrement("langfuse.audit_log.access_event_dropped", 1, {
      reason: "enqueue_failed",
    });
  }
}
