import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { TRPCError } from "@trpc/server";
import { logger } from "@langfuse/shared/src/server";

export const agentStudioRouter = createTRPCRouter({
  listServers: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:read",
      });
      return ctx.prisma.agentStudioServer.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        include: { chains: { orderBy: { createdAt: "desc" } } },
      });
    }),

  upsertServer: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string().optional(),
        name: z.string().min(1),
        serverUrl: z.string().url(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      if (input.id) {
        const existing = await ctx.prisma.agentStudioServer.findFirst({
          where: { id: input.id, projectId: input.projectId },
        });
        if (!existing)
          throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        return ctx.prisma.agentStudioServer.update({
          where: { id: input.id },
          data: { name: input.name, serverUrl: input.serverUrl },
        });
      }
      return ctx.prisma.agentStudioServer.create({
        data: {
          name: input.name,
          serverUrl: input.serverUrl,
          projectId: input.projectId,
        },
      });
    }),

  deleteServer: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), serverId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      const existing = await ctx.prisma.agentStudioServer.findFirst({
        where: { id: input.serverId, projectId: input.projectId },
      });
      if (!existing)
        throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
      await ctx.prisma.agentStudioServer.delete({ where: { id: input.serverId } });
      return { success: true };
    }),

  testConnection: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), serverId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:read",
      });
      const server = await ctx.prisma.agentStudioServer.findFirst({
        where: { id: input.serverId, projectId: input.projectId },
      });
      if (!server)
        throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
      try {
        const res = await fetch(`${server.serverUrl}/assistants/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 1 }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
        }
        return { success: true };
      } catch (err) {
        logger.warn("AgentStudio connection test failed", { err });
        return {
          success: false,
          error: err instanceof Error ? err.message : "Connection failed",
        };
      }
    }),

  upsertChain: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        serverId: z.string(),
        id: z.string().optional(),
        name: z.string().min(1),
        steps: z.array(
          z.object({
            assistantId: z.string(),
            assistantName: z.string(),
            fieldMappings: z.array(
              z.object({ fromPath: z.string(), toField: z.string() }),
            ),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      const server = await ctx.prisma.agentStudioServer.findFirst({
        where: { id: input.serverId, projectId: input.projectId },
      });
      if (!server)
        throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
      if (input.id) {
        return ctx.prisma.agentStudioChain.update({
          where: { id: input.id },
          data: { name: input.name, steps: input.steps },
        });
      }
      return ctx.prisma.agentStudioChain.create({
        data: { name: input.name, steps: input.steps, serverId: input.serverId },
      });
    }),

  deleteChain: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), chainId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      await ctx.prisma.agentStudioChain.delete({ where: { id: input.chainId } });
      return { success: true };
    }),
});
