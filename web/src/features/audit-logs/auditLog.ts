import {
  prisma as _prisma,
  type Role,
  AuditLogRecordType,
  type Prisma,
} from "@langfuse/shared/src/db";
import {
  formatSubmittedPublicKeyForLog,
  logger,
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
  | "skill"
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
  | "gatewayConfig"
  | "gatewayAiConnection"
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
        publicKey: true,
      },
    });

    const userId =
      apiKey?.isInAppAgentKey === true
        ? (apiKey.createdByUserId ?? undefined)
        : undefined;

    await db.auditLog.create({
      data: {
        apiKeyId: log.apiKeyId,
        userId,
        orgId: log.orgId,
        projectId: log.projectId,
        type: AuditLogRecordType.API_KEY,
        ...shared,
      },
    });

    logAuditEvent(log, {
      type: AuditLogRecordType.API_KEY,
      orgId: log.orgId,
      projectId: log.projectId,
      userId,
      apiKeyId: log.apiKeyId,
      publicKey: apiKey?.publicKey,
    });

    return;
  }

  if ("session" in log) {
    await db.auditLog.create({
      data: {
        userId: log.session.user.id,
        orgId: log.session.orgId,
        userOrgRole: log.session.orgRole,
        projectId: log.session.projectId,
        userProjectRole: log.session.projectRole,
        type: AuditLogRecordType.USER,
        ...shared,
      },
    });

    logAuditEvent(log, {
      type: AuditLogRecordType.USER,
      orgId: log.session.orgId,
      projectId: log.session.projectId,
      userId: log.session.user.id,
    });

    return;
  }

  if ("userId" in log) {
    await db.auditLog.create({
      data: {
        userId: log.userId,
        orgId: log.orgId,
        userOrgRole: log.orgRole,
        projectId: log.projectId,
        userProjectRole: log.projectRole,
        type: AuditLogRecordType.USER,
        ...shared,
      },
    });

    logAuditEvent(log, {
      type: AuditLogRecordType.USER,
      orgId: log.orgId,
      projectId: log.projectId,
      userId: log.userId,
    });

    return;
  }
}
