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

      const apiKeys = await ctx.prisma.llmApiKeys.findMany({
        where: {
          projectId: input.projectId,
        },
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
