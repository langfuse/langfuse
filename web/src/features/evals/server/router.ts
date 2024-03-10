import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { evalModels } from "@/src/features/evals/constants";
import { jsonSchema } from "@/src/utils/zod";

export const CreateEvalTemplate = z.object({
  projectId: z.string(),
  prompt: z.string(),
  model: evalModels,
  modelParameters: jsonSchema,
  variables: z.array(z.string()),
  outputSchema: z.object({
    score: z.string(),
    name: z.string(),
    reasoning: z.string(),
  }),
});

export const evalRouter = createTRPCRouter({
  allTemplates: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number(),
        page: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      console.log("Hello");
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalsTemplate:read",
      });

      const templates = await ctx.prisma.evalTemplate.findMany({
        where: {
          projectId: input.projectId,
        },
        take: input.limit,
        skip: input.page * input.limit,
      });

      const count = await ctx.prisma.evalTemplate.count({
        where: {
          projectId: input.projectId,
        },
      });
      return {
        templates: templates,
        totalCount: count,
      };
    }),
  createTemplate: protectedProjectProcedure
    .input(CreateEvalTemplate)
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalsTemplate:create",
      });

      const evalTemplate = await ctx.prisma.evalTemplate.create({
        data: {
          projectId: input.projectId,
          prompt: input.prompt,
          model: input.model,
          modelParams: input.modelParameters,
          vars: input.variables,
          outputSchema: input.outputSchema,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "evalTemplate",
        resourceId: evalTemplate.id,
        action: "create",
      });
    }),
});
