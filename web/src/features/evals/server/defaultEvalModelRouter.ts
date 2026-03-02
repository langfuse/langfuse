import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod/v4";
import { ZodModelConfig } from "@langfuse/shared";
import {
  DefaultEvalModelService,
  clearNoEvalConfigsCache,
} from "@langfuse/shared/src/server";

export const defaultEvalModelRouter = createTRPCRouter({
  fetchDefaultModel: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalDefaultModel:read",
      });

      return DefaultEvalModelService.fetchDefaultModel(input.projectId);
    }),
  upsertDefaultModel: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        provider: z.string(),
        adapter: z.string(),
        model: z.string(),
        modelParams: ZodModelConfig,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalDefaultModel:CUD",
      });

      return DefaultEvalModelService.upsertDefaultModel(input);
    }),
  deleteDefaultModel: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalDefaultModel:CUD",
      });

      const result = await ctx.prisma.$transaction(async (tx) => {
        const evalTemplates = await tx.evalTemplate.findMany({
          where: {
            OR: [{ projectId: input.projectId }, { projectId: null }],
            provider: null,
            model: null,
          },
        });

        await tx.jobConfiguration.updateMany({
          where: {
            evalTemplateId: { in: evalTemplates.map((et) => et.id) },
            projectId: input.projectId,
          },
          data: {
            status: "INACTIVE",
            statusMessage:
              "Evaluator paused: the shared default evaluation model was removed. Set a new default model or update the evaluator template, then reactivate it.",
          },
        });

        await tx.defaultLlmModel.delete({
          where: {
            projectId: input.projectId,
          },
        });

        return { success: true };
      });

      await clearNoEvalConfigsCache(input.projectId, "traceBased");
      await clearNoEvalConfigsCache(input.projectId, "eventBased");

      return result;
    }),
});
