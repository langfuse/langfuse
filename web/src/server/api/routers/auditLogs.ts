import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedOrganizationProcedure,
} from "../trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { paginationZod } from "@langfuse/shared";
import { AuditLogRecordType, type AuditLog } from "@langfuse/shared/src/db";

type AuditLogActor =
  | {
      type: "API_KEY";
      body: { id: string | null; publicKey: string | null };
    }
  | {
      type: "USER";
      body: {
        id: string | null;
        name: string | null;
        email: string | null;
        image: string | null;
      };
    }
  | null;

function mapAuditLogsWithActors(
  auditLogs: AuditLog[],
  userMap: Map<
    string,
    {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    }
  >,
  apiKeyMap: Map<string, { id: string; publicKey: string }>,
) {
  return auditLogs.map((log) => {
    let actor: AuditLogActor = null;
    switch (log.type) {
      case AuditLogRecordType.USER:
        actor = {
          type: log.type,
          body: userMap.get(log.userId ?? "") ?? {
            id: log.userId,
            name: null,
            email: null,
            image: null,
          },
        };
        break;
      case AuditLogRecordType.API_KEY:
        actor = {
          type: log.type,
          body: apiKeyMap.get(log.apiKeyId ?? "") ?? {
            id: log.apiKeyId,
            publicKey: null,
          },
        };
        break;
      default:
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        const exhaustiveCheckDefault: never = log.type;
        throw new Error(`Type ${log.type} not found`);
    }

    return {
      ...log,
      actor,
    };
  });
}

export const auditLogsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has access to audit logs feature
      throwIfNoEntitlement({
        entitlement: "audit-logs",
        sessionUser: ctx.session.user,
        projectId: input.projectId,
      });

      // Check if user has access to the project
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "auditLogs:read",
      });

      const [auditLogs, totalCount] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where: {
            projectId: input.projectId,
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: input.page * input.limit,
          take: input.limit,
        }),
        ctx.prisma.auditLog.count({
          where: {
            projectId: input.projectId,
          },
        }),
      ]);

      // Fetch user information for each audit log
      const userIds = [
        ...new Set(
          auditLogs.flatMap((log) => (log?.userId ? [log.userId] : [])),
        ),
      ];
      const apiKeyIds = [
        ...new Set(
          auditLogs.flatMap((log) => (log?.apiKeyId ? [log.apiKeyId] : [])),
        ),
      ];

      const [users, apiKeys] = await Promise.all([
        ctx.prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
            organizationMemberships: {
              some: {
                organization: {
                  projects: {
                    some: {
                      id: input.projectId,
                    },
                  },
                },
              },
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        }),
        ctx.prisma.apiKey.findMany({
          where: {
            id: {
              in: apiKeyIds,
            },
            projectId: input.projectId,
          },
          select: {
            id: true,
            publicKey: true,
          },
        }),
      ]);

      const userMap = new Map(users.map((user) => [user.id, user]));
      const apiKeyMap = new Map(apiKeys.map((apiKey) => [apiKey.id, apiKey]));

      return {
        data: mapAuditLogsWithActors(auditLogs, userMap, apiKeyMap),
        totalCount,
      };
    }),

  allByOrg: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has access to audit logs feature at org level
      throwIfNoEntitlement({
        entitlement: "audit-logs",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

      // Check if user has access to organization audit logs
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "auditLogs:read",
      });

      // Fetch organization-level audit logs (where projectId is null)
      // This includes: organization CRUD, project CRUD, org membership changes
      const [auditLogs, totalCount] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where: {
            orgId: input.orgId,
            projectId: null,
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: input.page * input.limit,
          take: input.limit,
        }),
        ctx.prisma.auditLog.count({
          where: {
            orgId: input.orgId,
            projectId: null,
          },
        }),
      ]);

      // Fetch user information for each audit log
      const userIds = [
        ...new Set(
          auditLogs.flatMap((log) => (log?.userId ? [log.userId] : [])),
        ),
      ];
      const apiKeyIds = [
        ...new Set(
          auditLogs.flatMap((log) => (log?.apiKeyId ? [log.apiKeyId] : [])),
        ),
      ];

      const [users, apiKeys] = await Promise.all([
        ctx.prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
            organizationMemberships: {
              some: {
                orgId: input.orgId,
              },
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        }),
        ctx.prisma.apiKey.findMany({
          where: {
            id: {
              in: apiKeyIds,
            },
            orgId: input.orgId,
            scope: "ORGANIZATION",
          },
          select: {
            id: true,
            publicKey: true,
          },
        }),
      ]);

      const userMap = new Map(users.map((user) => [user.id, user]));
      const apiKeyMap = new Map(apiKeys.map((apiKey) => [apiKey.id, apiKey]));

      return {
        data: mapAuditLogsWithActors(auditLogs, userMap, apiKeyMap),
        totalCount,
      };
    }),
});
