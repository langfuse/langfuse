import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DEFAULT_TRACE_JOB_DELAY, EvalTargetObject } from "@langfuse/shared";
import {
  EvalModelNames,
  ZodModelConfig,
  singleFilter,
  variableMapping,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { CreateLlmApiKey } from "@/src/features/llm-api-key/types";
import { encrypt } from "@langfuse/shared";

export function getDisplaySecretKey(secretKey: string) {
  return "..." + secretKey.slice(-4);
}

export const evalRouter = createTRPCRouter({
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
          resourceId: job.id,
          action: "create",
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  allConfigs: protectedProjectProcedure
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
        scope: "job:read",
      });

      const configs = await ctx.prisma.jobConfiguration.findMany({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
        },
        include: {
          evalTemplate: true,
        },
        take: input.limit,
        skip: input.page * input.limit,
      });

      const count = await ctx.prisma.jobConfiguration.count({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
        },
      });
      return {
        configs: configs,
        totalCount: count,
      };
    }),
});
