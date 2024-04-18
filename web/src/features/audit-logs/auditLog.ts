import { prisma as _prisma } from "@langfuse/shared/src/db";
import { type MembershipRole } from "@langfuse/shared";

export type AuditableResource =
  | "membership"
  | "membershipInvitation"
  | "datasetItem"
  | "dataset"
  | "trace"
  | "project"
  | "observation"
  | "score"
  | "model"
  | "prompt"
  | "session"
  | "apiKey"
  | "evalTemplate"
  | "job";

export type AuditLogSource =
  | {
      projectId: string;
      userId: string;
      userProjectRole: MembershipRole;
    }
  | {
      session: {
        user: {
          id: string;
        };
        projectRole: MembershipRole;
        projectId: string;
      };
    }
  | {
      projectId: string;
      publicApiKey: string;
    };

type AuditLog = {
  resourceType: AuditableResource;
  resourceId: string;
  action: string;
  before?: unknown;
  after?: unknown;
} & AuditLogSource;

export async function auditLog(log: AuditLog, prisma?: typeof _prisma) {
  await (prisma ?? _prisma).auditLog.create({
    data: {
      projectId: "projectId" in log ? log.projectId : log.session.projectId,
      userId:
        "publicApiKey" in log
          ? null
          : "userId" in log
            ? log.userId
            : log.session.user.id,
      userProjectRole:
        "publicApiKey" in log
          ? null
          : "userProjectRole" in log
            ? log.userProjectRole
            : log.session.projectRole,
      publicApiKey: "publicApiKey" in log ? log.publicApiKey : null,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      before: log.before ? JSON.stringify(log.before) : undefined,
      after: log.after ? JSON.stringify(log.after) : undefined,
    },
  });
}
