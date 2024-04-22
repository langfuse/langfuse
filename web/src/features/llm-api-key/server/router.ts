import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { env } from "@/src/env.mjs";
import { CreateLlmApiKey } from "@/src/features/llm-api-key/types";
import { encrypt } from "@langfuse/shared";

export function getDisplaySecretKey(secretKey: string) {
  return "..." + secretKey.slice(-4);
}

export const llmApiKeyRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "apiKeys:create",
        });

        const key = await ctx.prisma.llmApiKeys.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            secretKey: encrypt(input.secretKey),
            displaySecretKey: getDisplaySecretKey(input.secretKey),
            provider: input.provider,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "apiKey",
          resourceId: key.id,
          action: "create",
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number(),
        page: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }

      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:read",
      });

      const apiKeys = await ctx.prisma.llmApiKeys.findMany({
        where: {
          projectId: input.projectId,
        },
        take: input.limit,
        skip: input.page * input.limit,
      });

      const count = await ctx.prisma.llmApiKeys.count({
        where: {
          projectId: input.projectId,
        },
      });

      return {
        data: apiKeys.map((llmApiKey) => {
          // we must not return the secret key via the API
          const { secretKey, ...rest } = llmApiKey;
          return { ...rest };
        }),

        totalCount: count,
      };
    }),
});
