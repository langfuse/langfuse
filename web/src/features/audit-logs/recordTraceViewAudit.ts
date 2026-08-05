import { auditLog } from "@/src/features/audit-logs/auditLog";
import { type Role } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";

/**
 * Durable read-audit of single-trace views (UI + SDK) for compliance/security.
 * Emits a `read` event into the Postgres `audit_logs` table.
 *
 * Fire-and-forget: callers invoke without `await` and it never throws. Audit
 * durability outranks dedup, so a dropped write logs at `error` level AND
 * clears the dedup key it set, letting the next view re-audit instead of
 * silently swallowing the row for the full window.
 */

// One row per (actor, trace) per 15 min — collapses double-fire and poll noise.
const DEDUP_TTL_SECONDS = 15 * 60;

type RecordTraceViewAuditArgs = { resourceId: string } & (
  | {
      session: {
        user: { id: string };
        orgId: string;
        orgRole?: Role;
        // Required: trace ids are unique per project, so projectId must scope
        // the dedup key or a same-named trace in another project is dropped.
        projectId: string;
        projectRole?: Role;
      };
    }
  | { apiKeyId: string; orgId: string; projectId: string }
);

function dedupKey(args: RecordTraceViewAuditArgs): string {
  // Trace ids are user-suppliable and unique per project, not globally, so the
  // key is scoped by project. The SDK path is already project-scoped through
  // apiKeyId (one key belongs to one project).
  return "session" in args
    ? `auditview:user:${args.session.user.id}:${args.session.projectId}:${args.resourceId}`
    : `auditview:api:${args.apiKeyId}:${args.resourceId}`;
}

export async function recordTraceViewAudit(
  args: RecordTraceViewAuditArgs,
): Promise<void> {
  const key = dedupKey(args);

  // Dedup check and write are separate try/catch on purpose: a Redis error
  // (or a null client when the connection failed) must fail OPEN — still write
  // the row, since audit durability outranks dedup.
  //
  // The NX key is set BEFORE the write so concurrent double-fires still collapse
  // to one row; if the write then fails, we clear the key (below) so durability
  // is preserved despite the up-front set.
  let dedupKeySet = false;
  try {
    if (redis) {
      const isFirstView = await redis.set(
        key,
        "1",
        "EX",
        DEDUP_TTL_SECONDS,
        "NX",
      );
      if (isFirstView === null) {
        // Key already existed within the window → already audited, skip.
        return;
      }
      dedupKeySet = true;
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
    // Write failed: clear the dedup key we set so the next view re-audits
    // rather than being suppressed for the full window. Best-effort — a stale
    // key at worst costs one skipped audit.
    if (dedupKeySet && redis) {
      try {
        await redis.del(key);
      } catch (delErr) {
        logger.warn(
          "Failed to clear trace-view audit dedup key after write failure",
          delErr,
        );
      }
    }
  }
}
