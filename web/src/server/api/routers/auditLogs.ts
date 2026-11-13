import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedOrganizationProcedure,
} from "../trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { paginationZod } from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  getAuditLogs,
  getAuditLogsCount,
  type AuditLogEntry,
} from "@langfuse/shared/src/server";
import { orgBoundApiKeyScopes } from "@langfuse/shared/src/server/auth/apiKeys";

type AuditLogActor =
  | {
      type: "USER";
      body: {
        id: string | null;
        name: string | null;
        email: string | null;
        image: string | null;
      };
    }
  | {
      type: "API_KEY";
      body: { id: string | null; publicKey: string | null };
    }
  | {
      type: "SYSTEM";
      body: { name: string | null };
    };

/**
 * Resolves the actor of each entry. Current members and API keys are looked
 * up for their avatar and public key; users who have left the organisation
 * fall back to the name and email recorded with the event.
 */
async function withActors(
  prisma: PrismaClient,
  entries: AuditLogEntry[],
  scope: { orgId: string; projectId: string | null },
) {
  const userIds = [...new Set(entries.flatMap((entry) => entry.userId ?? []))];
  const apiKeyIds = [
    ...new Set(entries.flatMap((entry) => entry.apiKeyId ?? [])),
  ];

  const [users, apiKeys] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { in: userIds },
        organizationMemberships: { some: { orgId: scope.orgId } },
      },
      select: { id: true, name: true, email: true, image: true },
    }),
    prisma.apiKey.findMany({
      where: {
        id: { in: apiKeyIds },
        ...(scope.projectId
          ? { projectId: scope.projectId }
          : { orgId: scope.orgId, scope: { in: orgBoundApiKeyScopes } }),
      },
      select: { id: true, publicKey: true },
    }),
  ]);
  const userMap = new Map(users.map((user) => [user.id, user]));
  const apiKeyMap = new Map(apiKeys.map((apiKey) => [apiKey.id, apiKey]));

  return entries.map(({ timestamp, actorType, ...entry }) => {
    let actor: AuditLogActor;
    switch (actorType) {
      case "USER":
        actor = {
          type: "USER",
          body: userMap.get(entry.userId ?? "") ?? {
            id: entry.userId,
            name: entry.actorName,
            email: entry.actorEmail,
            image: null,
          },
        };
        break;
      case "API_KEY":
        actor = {
          type: "API_KEY",
          body: apiKeyMap.get(entry.apiKeyId ?? "") ?? {
            id: entry.apiKeyId,
            publicKey: null,
          },
        };
        break;
      case "SYSTEM":
        actor = { type: "SYSTEM", body: { name: entry.actorName } };
        break;
      default: {
        const exhaustiveCheck: never = actorType;
        throw new Error(`Unknown audit log actor type ${exhaustiveCheck}`);
      }
    }

    return { ...entry, createdAt: timestamp, type: actorType, actor };
  });
}

async function getAuditLogPage(
  prisma: PrismaClient,
  args: {
    orgId: string;
    projectId: string | null;
    page: number;
    limit: number;
  },
) {
  const scope =
    args.projectId !== null
      ? { projectId: args.projectId }
      : { orgId: args.orgId, projectId: null };
  const [entries, totalCount] = await Promise.all([
    getAuditLogs({
      ...scope,
      limit: args.limit,
      offset: args.page * args.limit,
    }),
    getAuditLogsCount(scope),
  ]);

  return {
    data: await withActors(prisma, entries, {
      orgId: args.orgId,
      projectId: args.projectId,
    }),
    totalCount,
  };
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

      return getAuditLogPage(ctx.prisma, {
        orgId: ctx.session.orgId,
        projectId: input.projectId,
        page: input.page,
        limit: input.limit,
      });
    }),

  allByOrg: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
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

      // Organisation-level events only: organisation and project CRUD,
      // membership changes and organisation API keys.
      return getAuditLogPage(ctx.prisma, {
        orgId: input.orgId,
        projectId: null,
        page: input.page,
        limit: input.limit,
      });
    }),
});
