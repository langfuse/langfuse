import { prisma as _prisma, type Role } from "@langfuse/shared/src/db";

export type AuditableResource =
  | "organization"
  | "orgMembership"
  | "projectMembership"
  | "membershipInvitation"
  | "comment"
  | "datasetItem"
  | "dataset"
  | "trace"
  | "project"
  | "observation"
  | "score"
  | "scoreConfig"
  | "model"
  | "prompt"
  | "session"
  | "apiKey"
  | "evalTemplate"
  | "job"
  | "posthogIntegration"
  | "llmApiKey"
  | "batchExport"
  | "stripeCheckoutSession"
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
      orgRole: Role;
      projectId?: string;
      projectRole?: Role;
    }
  | {
      session: {
        user: {
          id: string;
        };
        orgId: string;
        orgRole: Role;
        projectId?: string;
        projectRole?: Role;
      };
    }
);

export async function auditLog(log: AuditLog, prisma?: typeof _prisma) {
  const meta =
    "session" in log
      ? {
          userId: log.session.user.id,
          orgId: log.session.orgId,
          userOrgRole: log.session.orgRole,
          projectId: log.session.projectId,
          userProjectRole: log.session.projectRole,
        }
      : {
          userId: log.userId,
          orgId: log.orgId,
          userOrgRole: log.orgRole,
          projectId: log.projectId,
          userProjectRole: log.projectRole,
        };

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
