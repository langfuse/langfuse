import { InternalServerError } from "@langfuse/shared";
import {
  logger,
  recordIncrement,
  stageAuditLogEvents,
  type StageAuditLogEventInput,
} from "@langfuse/shared/src/server";

export type AccessEvent = Omit<
  Extract<StageAuditLogEventInput, { kind: "access" }>,
  "kind"
>;

/**
 * Stages an access event, failing closed: the read must not return data that
 * was not recorded. Callers check `isAccessAuditLogEnabled` first, so only
 * orgs that record access events reach it.
 */
export async function stageAccessEvent(event: AccessEvent): Promise<void> {
  try {
    await stageAuditLogEvents([{ kind: "access", ...event }]);
  } catch (error) {
    recordIncrement("langfuse.audit_log.access_event_write_failed");
    logger.error("Failed to record access event, failing the read", {
      error,
      orgId: event.orgId,
      projectId: event.projectId,
      route: event.route,
    });
    throw new InternalServerError();
  }
}
