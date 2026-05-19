import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { WebCallbackEndpointUpsertInputSchema } from "@/src/features/web-callbacks/types";
import {
  toBrowserWebCallbackEndpoint,
  toSafeWebCallbackEndpoint,
  upsertWebCallbackEndpoint,
} from "@/src/features/web-callbacks/server/service";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

export const webCallbacksRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const endpoints = await ctx.prisma.webCallbackEndpoint.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "asc" },
      });

      return endpoints.map(toSafeWebCallbackEndpoint);
    }),

  enabled: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const endpoint = await ctx.prisma.webCallbackEndpoint.findFirst({
        where: { projectId: input.projectId, enabled: true },
        orderBy: { createdAt: "asc" },
      });

      return toBrowserWebCallbackEndpoint(endpoint);
    }),

  upsert: protectedProjectProcedure
    .input(WebCallbackEndpointUpsertInputSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const before = input.id
        ? await ctx.prisma.webCallbackEndpoint
            .findFirst({
              where: { id: input.id, projectId: input.projectId },
            })
            .then((endpoint) =>
              endpoint ? toSafeWebCallbackEndpoint(endpoint) : null,
            )
        : null;

      const endpoint = await upsertWebCallbackEndpoint({
        prisma: ctx.prisma,
        projectId: input.projectId,
        input,
      });

      await auditLog(
        {
          session: ctx.session,
          action: before ? "update" : "create",
          resourceType: "webCallbackEndpoint",
          resourceId: endpoint.id,
          before,
          after: endpoint,
        },
        ctx.prisma,
      );

      return endpoint;
    }),

  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const endpoint = await ctx.prisma.webCallbackEndpoint.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Web callback endpoint not found",
        });
      }

      const safeEndpoint = toSafeWebCallbackEndpoint(endpoint);

      await ctx.prisma.webCallbackEndpoint.delete({
        where: { id: input.id },
      });

      await auditLog(
        {
          session: ctx.session,
          action: "delete",
          resourceType: "webCallbackEndpoint",
          resourceId: input.id,
          before: safeEndpoint,
        },
        ctx.prisma,
      );
    }),
});
