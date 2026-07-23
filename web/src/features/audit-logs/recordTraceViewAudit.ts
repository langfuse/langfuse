import { auditLog } from "@/src/features/audit-logs/auditLog";
import { type Role } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";

/**
 * Durable read-audit of single-trace views (UI + SDK) for compliance/security.
 * Emits a `read` event into the Postgres `audit_logs` table.
 *
 * Fire-and-forget: callers invoke with `void` and it never throws. A dropped
 * write defeats the audit, so write failures log at `error` level.
 */

// One row per (actor, trace) per 15 min — collapses double-fire and poll noise.
const DEDUP_TTL_SECONDS = 15 * 60;

type RecordTraceViewAuditArgs = { resourceId: string } & (
  | {
      session: {
        user: { id: string };
        orgId: string;
        orgRole?: Role;
        projectId?: string;
        projectRole?: Role;
      };
    }
  | { apiKeyId: string; orgId: string; projectId: string }
);

function dedupKey(args: RecordTraceViewAuditArgs): string {
  return "session" in args
    ? `auditview:user:${args.session.user.id}:${args.resourceId}`
    : `auditview:api:${args.apiKeyId}:${args.resourceId}`;
}

export async function recordTraceViewAudit(
  args: RecordTraceViewAuditArgs,
): Promise<void> {
  // Dedup check and write are separate try/catch on purpose: a Redis error
  // (or a null client when the connection failed) must fail OPEN — still write
  // the row, since audit durability outranks dedup.
  try {
    if (redis) {
      const isFirstView = await redis.set(
        dedupKey(args),
        "1",
        "EX",
        DEDUP_TTL_SECONDS,
        "NX",
      );
      if (isFirstView === null) {
        // Key already existed within the window → already audited, skip.
        return;
      }
    }
  } catch (e) {
    logger.warn(
      "trace-view audit dedup check failed, failing open (writing audit anyway)",
      e,
    );
  }

  try {
    await auditLog({
      ...args,
      resourceType: "trace",
      action: "read",
    });
  } catch (e) {
    logger.error("Failed to write trace-view audit log", e);
  }
}
