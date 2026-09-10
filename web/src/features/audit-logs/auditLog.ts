import { randomUUID } from "crypto";
import {
  prisma as _prisma,
  type Role,
  AuditLogRecordType,
} from "@langfuse/shared/src/db";
import {
  AuditLogQueue,
  convertPostgresAuditLogToClickhouse,
  QueueJobs,
  type AuditLogChangeRow,
  type AuditLogRecordInsertType,
} from "@langfuse/shared/src/server";

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
  | "session"
  | "apiKey"
  | "evalTemplate"
  | "job"
  | "blobStorageIntegration"
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
  // legacy resources
  | "membership";

type AuditLog = {
  resourceType: AuditableResource;
  resourceId: string;
  action: string;
  before?: unknown;
  after?: unknown;
} & (
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
    }
);

/**
 * Queues an audit log row for ClickHouse. Throws when Redis is unavailable so
 * a change event is never silently lost.
 */
async function enqueueAuditLogRecord(
  record: AuditLogRecordInsertType,
): Promise<void> {
  const queue = AuditLogQueue.getInstance();
  if (!queue) {
    throw new Error("AuditLogQueue is not available, Redis is not configured");
  }
  await queue.add(QueueJobs.AuditLogJob, {
    id: record.id,
    timestamp: new Date(),
    name: QueueJobs.AuditLogJob,
    payload: record,
  });
}

type ChangeEventData = Omit<AuditLogChangeRow, "id" | "createdAt">;

/**
 * Writes the change event to Postgres and queues the same row (same id and
 * created_at) for ClickHouse, where the read path lives. The id and timestamp
 * are assigned here rather than read back from Postgres so both stores receive
 * the identical row regardless of what the insert returns.
 */
async function writeChangeEvent(db: typeof _prisma, data: ChangeEventData) {
  const row: AuditLogChangeRow = {
    id: randomUUID(),
    createdAt: new Date(),
    ...data,
  };
  await db.auditLog.create({ data: row });
  await enqueueAuditLogRecord(convertPostgresAuditLogToClickhouse(row));
}

export async function auditLog(log: AuditLog, prisma?: typeof _prisma) {
  const db = prisma ?? _prisma;
  const shared = {
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    action: log.action,
    before: log.before ? JSON.stringify(log.before) : undefined,
    after: log.after ? JSON.stringify(log.after) : undefined,
  };

  if ("apiKeyId" in log) {
    // Sequential find + create, not $transaction. Interactive transactions
    // use a 5s timeout and hold a pooled connection across both awaits, so
    // an event-loop stall can 500 public API writes that only need an audit log.
    const apiKey = await db.apiKey.findUnique({
      where: { id: log.apiKeyId },
      select: {
        isInAppAgentKey: true,
        createdByUserId: true,
      },
    });

    await writeChangeEvent(db, {
      apiKeyId: log.apiKeyId,
      userId:
        apiKey?.isInAppAgentKey === true
          ? (apiKey.createdByUserId ?? undefined)
          : undefined,
      orgId: log.orgId,
      projectId: log.projectId,
      type: AuditLogRecordType.API_KEY,
      ...shared,
    });

    return;
  }

  if ("session" in log) {
    await writeChangeEvent(db, {
      userId: log.session.user.id,
      orgId: log.session.orgId,
      userOrgRole: log.session.orgRole,
      projectId: log.session.projectId,
      userProjectRole: log.session.projectRole,
      type: AuditLogRecordType.USER,
      ...shared,
    });

    return;
  }

  if ("userId" in log) {
    await writeChangeEvent(db, {
      userId: log.userId,
      orgId: log.orgId,
      userOrgRole: log.orgRole,
      projectId: log.projectId,
      userProjectRole: log.projectRole,
      type: AuditLogRecordType.USER,
      ...shared,
    });

    return;
  }
}
