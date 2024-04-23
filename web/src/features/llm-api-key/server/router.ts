import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { env } from "@/src/env.mjs";
import { CreateLlmApiKey } from "@/src/features/llm-api-key/types";
import { encrypt } from "@langfuse/shared/encryption";

export function getDisplaySecretKey(secretKey: string) {
  return "..." + secretKey.slice(-4);
}

export const LlmApiKey = z
  .object({
    id: z.string(),
    projectId: z.string(),
    provider: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    displaySecretKey: z.string(),
  })
  // strict mode to prevent extra keys. Thorws error otherwise
  // https://github.com/colinhacks/zod?tab=readme-ov-file#strict
  .strict();

export const llmApiKeyRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      try {
        if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
          throw new Error("Evals available in cloud only");
        }
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmApiKeys:create",
        });

        const key = await ctx.prisma.llmApiKeys.create({
          data: {
            projectId: input.projectId,
            secretKey: encrypt(input.secretKey),
            displaySecretKey: getDisplaySecretKey(input.secretKey),
            provider: input.provider,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmApiKey",
          resourceId: key.id,
          action: "create",
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:delete",
      });

      await ctx.prisma.llmApiKeys.delete({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "llmApiKey",
        resourceId: input.id,
        action: "delete",
      });
    }),
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }

      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      const apiKeys = z.array(LlmApiKey).parse(
        await ctx.prisma.llmApiKeys.findMany({
          // we must not return the secret key via the API, hence not selected
          select: {
            id: true,
            createdAt: true,
            updatedAt: true,
            provider: true,
            displaySecretKey: true,
            projectId: true,
          },
          where: {
            projectId: input.projectId,
          },
        }),
      );

      const count = await ctx.prisma.llmApiKeys.count({
        where: {
          projectId: input.projectId,
        },
      });

      return {
        data: apiKeys, // does not contain the secret key
        totalCount: count,
      };
    }),
});
