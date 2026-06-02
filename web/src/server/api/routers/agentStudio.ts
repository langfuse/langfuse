import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { TRPCError } from "@trpc/server";
import { logger } from "@langfuse/shared/src/server";
import { encrypt, decrypt } from "@langfuse/shared/encryption";

type StoredHeader = { name: string; value: string };

function encryptHeaders(headers: StoredHeader[]): string {
  return encrypt(JSON.stringify(headers));
}

function decryptHeaderNames(encrypted: string | null): string[] {
  if (!encrypted) return [];
  try {
    return (JSON.parse(decrypt(encrypted)) as StoredHeader[]).map(
      (h) => h.name,
    );
  } catch {
    return [];
  }
}

export const agentStudioRouter = createTRPCRouter({
  listServers: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:read",
      });
      const servers = await ctx.prisma.agentStudioServer.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        include: { chains: { orderBy: { createdAt: "desc" } } },
      });
      // Return header names only — never send encrypted values to the client
      return servers.map((s) => ({
        ...s,
        headersEncrypted: undefined,
        headerNames: decryptHeaderNames(s.headersEncrypted),
      }));
    }),

  upsertServer: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string().optional(),
        name: z.string().min(1),
        serverUrl: z.url(),
        // headers: present = update; absent = keep existing
        headers: z
          .array(z.object({ name: z.string(), value: z.string() }))
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });

      const headersEncrypted =
        input.headers !== undefined
          ? input.headers.length > 0
            ? encryptHeaders(input.headers)
            : null
          : undefined; // undefined = don't change existing value

      if (input.id) {
        const existing = await ctx.prisma.agentStudioServer.findFirst({
          where: { id: input.id, projectId: input.projectId },
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Server not found",
          });
        return ctx.prisma.agentStudioServer.update({
          where: { id: input.id },
          data: {
            name: input.name,
            serverUrl: input.serverUrl,
            ...(headersEncrypted !== undefined ? { headersEncrypted } : {}),
          },
        });
      }
      return ctx.prisma.agentStudioServer.create({
        data: {
          name: input.name,
          serverUrl: input.serverUrl,
          projectId: input.projectId,
          headersEncrypted: headersEncrypted ?? null,
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
      await ctx.prisma.agentStudioServer.delete({
        where: { id: input.serverId },
      });
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
          return {
            success: false,
            error: `HTTP ${res.status}: ${res.statusText}`,
          };
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
        data: {
          name: input.name,
          steps: input.steps,
          serverId: input.serverId,
        },
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
      await ctx.prisma.agentStudioChain.delete({
        where: { id: input.chainId },
      });
      return { success: true };
    }),
});
