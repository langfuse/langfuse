import {
  prisma as _prisma,
  type Role,
  AuditLogRecordType,
} from "@langfuse/shared/src/db";
import type {
  ProjectAuthedContext,
  OrgAuthedContext,
} from "@/src/server/api/trpc";
import type { NextApiRequest } from "next";
import { extractIpInfo } from "@langfuse/shared/src/server";

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
  req: NextApiRequest;

  // negative assertions to prevent excess properties
  trpcCtx?: never;
  session?: never;
  userId?: never;
  orgRole?: never;
  projectRole?: never;
};

type AuditLog = AuditLogWithTrpcCtx | AuditLogWithUserIds | AuditLogWithApiKey;

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
    const ipInfo = extractIpInfo(
      log.req.headers,
      log.req.socket?.remoteAddress,
    );

    return {
      apiKeyId: log.apiKeyId,
      orgId: log.orgId,
      projectId: log.projectId,
      type: AuditLogRecordType.API_KEY,
      clientIp: ipInfo.clientIp ?? undefined,
      ipChain: ipInfo.ipChain ?? undefined,
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
      clientIp: meta.clientIp ?? undefined,
      ipChain: meta.ipChain ?? undefined,
    },
  });
}
