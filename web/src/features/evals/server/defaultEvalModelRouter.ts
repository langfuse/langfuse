import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod";
import {
  EvaluatorBlockReason,
  ZodModelConfig,
  getEvaluatorBlockMetadata,
} from "@langfuse/shared";
import {
  DefaultEvalModelService,
  blockEvaluatorConfigsInTx,
  EvaluatorBlockSource,
  finalizeBlockedEvaluatorConfigBlocks,
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
    .input(z.object({ projectId: z.string() }))
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
          select: {
            id: true,
          },
        });

        const blockResult = await blockEvaluatorConfigsInTx({
          tx,
          projectId: input.projectId,
          where: {
            evalTemplateId: {
              in: evalTemplates.map((template) => template.id),
            },
          },
          blockReason: EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
          blockMessage: getEvaluatorBlockMetadata(
            EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
          ).message,
        });

        // Delete the default model within the transaction
        await tx.defaultLlmModel.delete({
          // unique constraint on projectId
          where: {
            projectId: input.projectId,
          },
        });

        return blockResult;
      });

      await finalizeBlockedEvaluatorConfigBlocks({
        projectId: input.projectId,
        source: EvaluatorBlockSource.DEFAULT_EVAL_MODEL_DELETION,
        blockedByReason: {
          [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]:
            result.blockedJobConfigIds,
        },
      });

      return { success: true };
    }),
});
