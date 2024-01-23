import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { encrypt } from "@/src/utils/encryption";
import { TRPCError } from "@trpc/server";
import * as z from "zod";

export const llmApiKeysRouter = createTRPCRouter({
  byProjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      return ctx.prisma.llmApiKey.findMany({
        where: {
          projectId: input.projectId,
        },
        select: {
          id: true,
          createdAt: true,
          lastUsedAt: true,
          name: true,
          model: true,
          provider: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        key: z.string(),
        name: z.string().optional(),
        model: z.string().optional(),
        provider: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:CUD",
      });

      if (!process.env.LLM_API_ENCRYPTION_KEY) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LLM API encryption key not provided",
        });
      }

      const llmApiKey = await ctx.prisma.llmApiKey.create({
        data: {
          projectId: input.projectId,
          encryptedKey: await encrypt(
            process.env.LLM_API_ENCRYPTION_KEY,
            input.key,
          ),
          name: input.name,
          model: input.model,
          provider: input.provider,
        },
      });

      return {
        id: llmApiKey.id,
        createdAt: llmApiKey.createdAt,
        name: input.name,
        model: input.model,
        provider: input.provider,
      };
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:CUD",
      });

      // Make sure the API key exists and belongs to the project the user has access to
      const llmApiKey = await ctx.prisma.llmApiKey.findFirstOrThrow({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      await ctx.prisma.llmApiKey.delete({
        where: {
          id: llmApiKey.id,
        },
      });

      return true;
    }),
});
