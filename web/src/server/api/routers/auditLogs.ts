import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedOrganizationProcedure,
} from "../trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { paginationZod, singleFilter } from "@langfuse/shared";
import { AuditLogRecordType, type prisma } from "@langfuse/shared/src/db";
import {
  type AuditLogEntry,
  getAuditLogs,
  getAuditLogsCount,
} from "@langfuse/shared/src/server";

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
  auditLogs: AuditLogEntry[],
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

const auditLogFilterZod = z.array(singleFilter).nullish();

/**
 * Reads one page from ClickHouse and resolves the actors against Postgres.
 * Users are only resolved when they belong to the organisation and API keys
 * only when they belong to the scope, so a row never leaks another tenant's
 * display data through a spoofed id.
 */
async function getAuditLogPage(args: {
  db: typeof prisma;
  orgId: string;
  projectId: string | null;
  filter: z.infer<typeof auditLogFilterZod>;
  page: number;
  limit: number;
}) {
  const scope = {
    orgId: args.orgId,
    projectId: args.projectId,
    filter: args.filter ?? [],
  };
  const [auditLogs, totalCount] = await Promise.all([
    getAuditLogs({
      ...scope,
      limit: args.limit,
      offset: args.page * args.limit,
    }),
    getAuditLogsCount(scope),
  ]);

  const userIds = [
    ...new Set(auditLogs.flatMap((log) => (log.userId ? [log.userId] : []))),
  ];
  const apiKeyIds = [
    ...new Set(
      auditLogs.flatMap((log) => (log.apiKeyId ? [log.apiKeyId] : [])),
    ),
  ];

  const [users, apiKeys] = await Promise.all([
    userIds.length === 0
      ? []
      : args.db.user.findMany({
          where: {
            id: { in: userIds },
            organizationMemberships: { some: { orgId: args.orgId } },
          },
          select: { id: true, name: true, email: true, image: true },
        }),
    apiKeyIds.length === 0
      ? []
      : args.db.apiKey.findMany({
          where: {
            id: { in: apiKeyIds },
            ...(args.projectId
              ? { projectId: args.projectId }
              : { orgId: args.orgId, scope: "ORGANIZATION" }),
          },
          select: { id: true, publicKey: true },
        }),
  ]);

  const userMap = new Map(users.map((user) => [user.id, user]));
  const apiKeyMap = new Map(apiKeys.map((apiKey) => [apiKey.id, apiKey]));

  return {
    data: mapAuditLogsWithActors(auditLogs, userMap, apiKeyMap),
    totalCount,
  };
}

export const auditLogsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        filter: auditLogFilterZod,
        ...paginationZod,
      }),
    )
    .query(async ({ ctx, input }) => {
      throwIfNoEntitlement({
        entitlement: "audit-logs",
        sessionUser: ctx.session.user,
        projectId: input.projectId,
      });

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectAuditLogs:read",
      });

      return getAuditLogPage({
        db: ctx.prisma,
        orgId: ctx.session.orgId,
        projectId: input.projectId,
        filter: input.filter,
        page: input.page,
        limit: input.limit,
      });
    }),

  allByOrg: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        filter: auditLogFilterZod,
        ...paginationZod,
      }),
    )
    .query(async ({ ctx, input }) => {
      throwIfNoEntitlement({
        entitlement: "audit-logs",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "orgAuditLogs:read",
      });

      // Organisation-level rows only: organisation and project CRUD, org
      // memberships. Project rows live on the project pages.
      return getAuditLogPage({
        db: ctx.prisma,
        orgId: input.orgId,
        projectId: null,
        filter: input.filter,
        page: input.page,
        limit: input.limit,
      });
    }),
});
