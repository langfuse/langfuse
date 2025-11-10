import {
  prisma as _prisma,
  type Role,
  AuditLogRecordType,
} from "@langfuse/shared/src/db";
import type {
  ProjectAuthedContext,
  OrgAuthedContext,
} from "@/src/server/api/trpc";

// Union type for authed contexts with orgId (required for audit logs)
// AuthedContext is excluded because it doesn't guarantee orgId in session
type AuthedTRPCContext = ProjectAuthedContext | OrgAuthedContext;

export type AuditableResource =
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
  | "llmApiKey"
  | "llmTool"
  | "llmSchema"
  | "batchExport"
  | "stripeCheckoutSession"
  | "batchAction"
  | "automation"
  | "action"
  | "slackIntegration"
  | "cloudSpendAlert"
  // legacy resources
  | "membership";

// Base type for all audit log entries
type AuditLogBase = {
  resourceType: AuditableResource;
  resourceId: string;
  action: string;
  before?: unknown;
  after?: unknown;
};

// Mutually exclusive property sets using 'never' to prevent excess properties
type AuditLogWithTrpcCtx = AuditLogBase & {
  trpcCtx: AuthedTRPCContext;

  // negative assertions to prevent excess properties
  session?: never;
  userId?: never;
  orgId?: never;
  orgRole?: never;
  projectId?: never;
  projectRole?: never;
  apiKeyId?: never;
};

// to be deprecated when all audit logs use trpcCtx
type AuditLogWithSession = AuditLogBase & {
  session: {
    user: {
      id: string;
    };
    orgId: string;
    orgRole?: Role;
    projectId?: string;
    projectRole?: Role;
  };

  // negative assertions to prevent excess properties
  trpcCtx?: never;
  userId?: never;
  orgId?: never;
  orgRole?: never;
  projectId?: never;
  projectRole?: never;
  apiKeyId?: never;
};

type AuditLogWithUserIds = AuditLogBase & {
  userId: string;
  orgId: string;

  // negative assertions to prevent excess properties
  orgRole?: Role;
  projectId?: string;
  projectRole?: Role;
  trpcCtx?: never;
  session?: never;
  apiKeyId?: never;
};

type AuditLogWithApiKey = AuditLogBase & {
  apiKeyId: string;
  orgId: string;
  projectId?: string;

  // negative assertions to prevent excess properties
  trpcCtx?: never;
  session?: never;
  userId?: never;
  orgRole?: never;
  projectRole?: never;
};

type AuditLog =
  | AuditLogWithTrpcCtx
  | AuditLogWithSession
  | AuditLogWithUserIds
  | AuditLogWithApiKey;

// Uniform context type for audit log metadata
type UniformAuditLogContext = {
  userId?: string;
  apiKeyId?: string;
  orgId: string;
  projectId?: string;
  userOrgRole?: Role;
  userProjectRole?: Role;
  type: AuditLogRecordType;
  clientIp?: string;
  ipChain?: string[];
};

// Type guards for discriminated union narrowing
function hasTrpcCtx(log: AuditLog): log is AuditLogWithTrpcCtx {
  return "trpcCtx" in log && log.trpcCtx !== undefined;
}

function hasSession(log: AuditLog): log is AuditLogWithSession {
  return "session" in log && log.session !== undefined;
}

function hasUserId(log: AuditLog): log is AuditLogWithUserIds {
  return "userId" in log && log.userId !== undefined;
}

function hasApiKey(log: AuditLog): log is AuditLogWithApiKey {
  return "apiKeyId" in log && log.apiKeyId !== undefined;
}

// Mapper function that transforms different context types into a uniform context
function mapToUniformContext(log: AuditLog): UniformAuditLogContext {
  if (hasTrpcCtx(log)) {
    return {
      userId: log.trpcCtx.session.user.id,
      orgId: log.trpcCtx.session.orgId,
      userOrgRole: log.trpcCtx.session.orgRole,
      projectId:
        "projectId" in log.trpcCtx.session
          ? log.trpcCtx.session.projectId
          : undefined,
      userProjectRole:
        "projectRole" in log.trpcCtx.session
          ? log.trpcCtx.session.projectRole
          : undefined,
      type: AuditLogRecordType.USER,
      clientIp: log.trpcCtx.clientIp ?? undefined,
      ipChain: log.trpcCtx.ipChain ?? undefined,
    };
  }

  if (hasSession(log)) {
    return {
      userId: log.session.user.id,
      orgId: log.session.orgId,
      userOrgRole: log.session.orgRole,
      projectId: log.session.projectId,
      userProjectRole: log.session.projectRole,
      type: AuditLogRecordType.USER,
    };
  }

  if (hasUserId(log)) {
    return {
      userId: log.userId,
      orgId: log.orgId,
      userOrgRole: log.orgRole,
      projectId: log.projectId,
      userProjectRole: log.projectRole,
      type: AuditLogRecordType.USER,
    };
  }

  if (hasApiKey(log)) {
    return {
      apiKeyId: log.apiKeyId,
      orgId: log.orgId,
      projectId: log.projectId,
      type: AuditLogRecordType.API_KEY,
    };
  }

  // Type assertion to ensure all cases are handled
  // If a new type is added to AuditLog union, this will cause a TypeScript error
  void (log satisfies never);
  throw new Error(`Unhandled audit log context type: ${JSON.stringify(log)}`);
}

export async function auditLog(log: AuditLog, prisma?: typeof _prisma) {
  const meta = mapToUniformContext(log);

  await (prisma ?? _prisma).auditLog.create({
    data: {
      ...meta,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      before: log.before ? JSON.stringify(log.before) : undefined,
      after: log.after ? JSON.stringify(log.after) : undefined,
    },
  });
}
