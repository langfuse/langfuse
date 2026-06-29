import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  WebCalloutEndpointUpsertInputSchema,
  WebCalloutInvokeInputSchema,
} from "@/src/features/web-callouts/types";
import {
  invokeWebCalloutEndpoint,
  toEnabledWebCallout,
  toSafeWebCalloutEndpoint,
  upsertWebCalloutEndpoint,
} from "@/src/features/web-callouts/server/service";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

export const webCalloutsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const endpoints = await ctx.prisma.webCalloutEndpoint.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "asc" },
      });

      return endpoints.map(toSafeWebCalloutEndpoint);
    }),

  enabled: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:read",
      });

      const endpoint = await ctx.prisma.webCalloutEndpoint.findFirst({
        where: { projectId: input.projectId, enabled: true },
        orderBy: { createdAt: "asc" },
      });

      return toEnabledWebCallout(endpoint);
    }),

  upsert: protectedProjectProcedure
    .input(WebCalloutEndpointUpsertInputSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const before = input.id
        ? await ctx.prisma.webCalloutEndpoint
            .findFirst({
              where: { id: input.id, projectId: input.projectId },
            })
            .then((endpoint) =>
              endpoint ? toSafeWebCalloutEndpoint(endpoint) : null,
            )
        : null;

      const endpoint = await upsertWebCalloutEndpoint({
        prisma: ctx.prisma,
        projectId: input.projectId,
        input,
      });

      await auditLog(
        {
          session: ctx.session,
          action: before ? "update" : "create",
          resourceType: "webCalloutEndpoint",
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

      const endpoint = await ctx.prisma.webCalloutEndpoint.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Web callout endpoint not found",
        });
      }

      const safeEndpoint = toSafeWebCalloutEndpoint(endpoint);

      await ctx.prisma.webCalloutEndpoint.delete({
        where: { id: input.id },
      });

      await auditLog(
        {
          session: ctx.session,
          action: "delete",
          resourceType: "webCalloutEndpoint",
          resourceId: input.id,
          before: safeEndpoint,
        },
        ctx.prisma,
      );
    }),

  invoke: protectedProjectProcedure
    .input(WebCalloutInvokeInputSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:read",
      });

      return invokeWebCalloutEndpoint({
        prisma: ctx.prisma,
        input,
        useEventsTable: ctx.session.user.v4BetaEnabled === true,
        invoker: {
          orgId: ctx.session.orgId,
          userId: ctx.session.user.id,
        },
      });
    }),
});
