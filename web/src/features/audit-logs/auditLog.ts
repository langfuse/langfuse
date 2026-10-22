import {
  prisma as _prisma,
  type Role,
  AuditLogRecordType,
  type Prisma,
} from "@langfuse/shared/src/db";
import { type AuditLogActor as StagedAuditLogActor } from "@langfuse/shared";
import {
  deriveAuditLogEventId,
  formatSubmittedPublicKeyForLog,
  logger,
  recordIncrement,
  stageAuditLogEvents,
  type StageAuditLogEventInput,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { isAuditLogEnabled } from "@/src/features/audit-logs/isAuditLogEnabled";

type AuditableResource =
  | "annotationQueue"
  | "annotationQueueItem"
  | "annotationQueueAssignment"
  | "organization"
  | "orgMembership"
  | "projectMembership"
  | "membershipInvitation"
  | "comment"
  | "datasetItem"
  | "dataset"
  | "datasetRun"
  | "datasetRunItem"
  | "trace"
  | "project"
  | "observation"
  | "score"
  | "scoreConfig"
  | "model"
  | "notificationPreference"
  | "prompt"
  | "promptProtectedLabel"
  | "skill"
  | "session"
  | "apiKey"
  | "evalTemplate"
  | "job"
  | "blobStorageIntegration"
  | "externalMediaStorageIntegration"
  | "posthogIntegration"
  | "mixpanelIntegration"
  | "webCalloutEndpoint"
  | "llmApiKey"
  | "llmTool"
  | "llmSchema"
  | "batchExport"
  | "stripeCheckoutSession"
  | "batchAction"
  | "automation"
  | "action"
  | "dashboardWidget"
  | "dashboard"
  | "slackIntegration"
  | "cloudSpendAlert"
  | "verifiedDomain"
  | "ssoConfig"
  | "gatewayConfig"
  | "gatewayAiConnection"
  | "topicConfig"
  // legacy resources
  | "membership";

export type AuditLogActor =
  | {
      userId: string;
      orgId: string;
      orgRole?: Role;
      projectId?: string;
      projectRole?: Role;
    }
  | {
      session: {
        user: {
          id: string;
          name?: string | null;
          email?: string | null;
        };
        orgId: string;
        orgRole?: Role;
        projectId?: string;
        projectRole?: Role;
      };
    }
  | {
      apiKeyId: string;
      orgId: string;
      projectId?: string;
    };

export type AuditLog = {
  resourceType: AuditableResource;
  resourceId: string;
  action: string;
  before?: unknown;
  after?: unknown;
} & AuditLogActor;

// Writes made by Langfuse itself rather than by a user or an API key pass these
// sentinel actor ids. The Postgres row keeps them, because its actor type
// cannot be SYSTEM. The staged event records a SYSTEM actor instead.
const SYSTEM_ACTOR_USER_IDS = new Set(["stripe-webhook", "clickhouse-webhook"]);
const ADMIN_API_KEY_IDS = new Set(["ADMIN_KEY", "ADMIN_API_KEY"]);
const ADMIN_API_ACTOR: StagedAuditLogActor = {
  type: "SYSTEM",
  name: "admin-api",
};

const STAGED_RECORD_SELECT = {
  id: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

// Mirrors each audit log record into the application logs so that actors can be
// correlated with web/worker log lines (e.g. trace deletions) without querying
// the audit_logs table. Only ids are logged, no emails or names.
function logAuditEvent(
  log: AuditLog,
  actor: {
    type: AuditLogRecordType;
    orgId: string;
    projectId?: string;
    userId?: string;
    apiKeyId?: string;
    publicKey?: string;
  },
) {
  let actorLabel = actor.userId;
  if (actor.type === AuditLogRecordType.API_KEY) {
    actorLabel = actor.publicKey
      ? formatSubmittedPublicKeyForLog(actor.publicKey)
      : actor.apiKeyId;
  }

  logger.info(
    `Audit log: ${log.resourceType}.${log.action} ${log.resourceId} by ${actor.type} ${actorLabel}`,
    {
      auditLog: true,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      actorType: actor.type,
      userId: actor.userId,
      apiKeyId: actor.apiKeyId,
      publicKey: actor.publicKey,
      orgId: actor.orgId,
      projectId: actor.projectId,
    },
  );
}

export async function auditLog(
  log: AuditLog,
  prisma?: typeof _prisma | Prisma.TransactionClient,
) {
  // Audit log records are an enterprise feature, so they are only persisted
  // when the instance is licensed for them. logAuditEvent below is deliberately
  // NOT gated: it is operator telemetry rather than the audited record itself
  // (ids only, no before/after diff), it is the sole actor trail for mutations
  // that have no parallel logger call of their own, and the actor logging added
  // alongside it elsewhere — batch actions, trace deletion — is ungated too.
  const persistRecord = isAuditLogEnabled();
  // Persisted records are also staged for ClickHouse, on Cloud only: the
  // worker relay that drains the staging table runs only there.
  const stageRecord =
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    env.LANGFUSE_AUDIT_LOG_STAGING_ENABLED === "true";

  const db = prisma ?? _prisma;
  // Defer JSON.stringify(before/after) until we know the record will be
  // persisted — a full prompt or observation object is non-trivial to
  // serialise, and unlicensed self-hosted instances call auditLog() on every
  // mutation only to discard it at the persistRecord gate below.
  const makeShared = () => ({
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    action: log.action,
    before: log.before ? JSON.stringify(log.before) : undefined,
    after: log.after ? JSON.stringify(log.after) : undefined,
  });

  if ("apiKeyId" in log) {
    // Sequential find + create, not $transaction. Interactive transactions
    // use a 5s timeout and hold a pooled connection across both awaits, so
    // an event-loop stall can 500 public API writes that only need an audit log.
    const apiKey = await db.apiKey.findUnique({
      where: { id: log.apiKeyId },
      select: {
        isInAppAgentKey: true,
        createdByUserId: true,
        publicKey: true,
        // The staged event names the user an in-app agent key acts for.
        createdByUser: stageRecord
          ? { select: { name: true, email: true } }
          : false,
      },
    });

    const userId =
      apiKey?.isInAppAgentKey === true
        ? (apiKey.createdByUserId ?? undefined)
        : undefined;

    // Actor telemetry is ungated — see top-of-function comment.
    logAuditEvent(log, {
      type: AuditLogRecordType.API_KEY,
      orgId: log.orgId,
      projectId: log.projectId,
      userId,
      apiKeyId: log.apiKeyId,
      publicKey: apiKey?.publicKey,
    });

    if (!persistRecord) return;

    const record = await db.auditLog.create({
      data: {
        apiKeyId: log.apiKeyId,
        userId,
        orgId: log.orgId,
        projectId: log.projectId,
        type: AuditLogRecordType.API_KEY,
        ...makeShared(),
      },
      select: STAGED_RECORD_SELECT,
    });

    if (stageRecord) {
      await stageChangeEvent(
        log,
        record,
        { orgId: log.orgId, projectId: log.projectId },
        toApiKeyActor(
          log.apiKeyId,
          userId,
          userId ? apiKey?.createdByUser : undefined,
        ),
        db,
      );
    }

    return;
  }

  if ("session" in log) {
    // Actor telemetry is ungated — see top-of-function comment.
    logAuditEvent(log, {
      type: AuditLogRecordType.USER,
      orgId: log.session.orgId,
      projectId: log.session.projectId,
      userId: log.session.user.id,
    });

    if (!persistRecord) return;

    const record = await db.auditLog.create({
      data: {
        userId: log.session.user.id,
        orgId: log.session.orgId,
        userOrgRole: log.session.orgRole,
        projectId: log.session.projectId,
        userProjectRole: log.session.projectRole,
        type: AuditLogRecordType.USER,
        ...makeShared(),
      },
      select: STAGED_RECORD_SELECT,
    });

    if (stageRecord) {
      await stageChangeEvent(
        log,
        record,
        { orgId: log.session.orgId, projectId: log.session.projectId },
        toUserActor(log.session.user, log.session),
        db,
      );
    }

    return;
  }

  if ("userId" in log) {
    // Actor telemetry is ungated — see top-of-function comment.
    logAuditEvent(log, {
      type: AuditLogRecordType.USER,
      orgId: log.orgId,
      projectId: log.projectId,
      userId: log.userId,
    });

    if (!persistRecord) return;

    const record = await db.auditLog.create({
      data: {
        userId: log.userId,
        orgId: log.orgId,
        userOrgRole: log.orgRole,
        projectId: log.projectId,
        userProjectRole: log.projectRole,
        type: AuditLogRecordType.USER,
        ...makeShared(),
      },
      select: STAGED_RECORD_SELECT,
    });

    if (stageRecord) {
      await stageChangeEvent(
        log,
        record,
        { orgId: log.orgId, projectId: log.projectId },
        toUserActor({ id: log.userId }, log),
        db,
      );
    }

    return;
  }
}

function toUserActor(
  user: { id: string; name?: string | null; email?: string | null },
  roles: { orgRole?: Role; projectRole?: Role },
): StagedAuditLogActor {
  if (SYSTEM_ACTOR_USER_IDS.has(user.id)) {
    return { type: "SYSTEM", name: user.id };
  }
  return {
    type: "USER",
    userId: user.id,
    name: user.name ?? undefined,
    email: user.email ?? undefined,
    orgRole: roles.orgRole,
    projectRole: roles.projectRole,
  };
}

/** `creator` is the user an in-app agent key acts for. */
function toApiKeyActor(
  apiKeyId: string,
  userId: string | undefined,
  creator: { name?: string | null; email?: string | null } | null | undefined,
): StagedAuditLogActor {
  if (ADMIN_API_KEY_IDS.has(apiKeyId)) return ADMIN_API_ACTOR;
  return {
    type: "API_KEY",
    apiKeyId,
    userId,
    name: creator?.name ?? undefined,
    email: creator?.email ?? undefined,
  };
}

/**
 * Stages the change event of a Postgres `audit_logs` row for the ClickHouse
 * `audit_logs` table, under the id `deriveAuditLogEventId` gives that row.
 * The Postgres row stays the source of truth, so a failure here is logged and
 * counted and never fails the caller. Given a transaction client, it stages
 * on that transaction.
 */
async function stageChangeEvent(
  log: AuditLog,
  record: { id: string; createdAt: Date },
  scope: { orgId: string; projectId?: string },
  actor: StagedAuditLogActor,
  db: typeof _prisma | Prisma.TransactionClient,
) {
  try {
    const event: StageAuditLogEventInput = {
      id: deriveAuditLogEventId(record.id, record.createdAt),
      timestamp: record.createdAt,
      kind: "change",
      orgId: scope.orgId,
      projectId: scope.projectId,
      actor,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      // Staging serializes these itself. Falsy values are dropped, as in the
      // Postgres row.
      before: log.before || undefined,
      after: log.after || undefined,
    };
    // Only the base client has $transaction.
    if ("$transaction" in db) {
      await stageAuditLogEvents([event], db);
    } else {
      await stageInSavepoint(event, db);
    }
  } catch (error) {
    recordIncrement("langfuse.audit_log.staging_write_failed");
    logger.error("Failed to stage audit log event", {
      error,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      orgId: scope.orgId,
    });
  }
}

/**
 * Stages the event on the caller's transaction, so it commits or rolls back
 * with the audited mutation and holds no second connection. A failed insert
 * aborts a Postgres transaction, so the insert runs behind a savepoint that a
 * failure rolls back to, which leaves the caller's transaction usable. Calls
 * on one transaction must not overlap, because they share the savepoint name.
 */
async function stageInSavepoint(
  event: StageAuditLogEventInput,
  tx: Prisma.TransactionClient,
) {
  await tx.$executeRaw`SAVEPOINT audit_log_staging`;
  try {
    await stageAuditLogEvents([event], tx);
  } catch (error) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT audit_log_staging`;
    throw error;
  }
  await tx.$executeRaw`RELEASE SAVEPOINT audit_log_staging`;
}
