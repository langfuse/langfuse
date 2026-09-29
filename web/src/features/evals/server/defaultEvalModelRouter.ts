import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod";

import { EvaluatorBlockReason, ZodModelConfig } from "@langfuse/shared";
import {
  blockEvaluatorsUsingDefaultModel,
  DefaultEvalModelService,
  EvaluatorBlockSource,
  finalizeEvaluatorBlocks,
  invalidateProjectEvalConfigCaches,
  unblockEvaluatorsUsingDefaultModel,
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

      const defaultModel =
        await DefaultEvalModelService.upsertDefaultModel(input);
      const unblocked = await ctx.prisma.$transaction((tx) =>
        unblockEvaluatorsUsingDefaultModel({
          tx,
          projectId: input.projectId,
        }),
      );

      if (unblocked.unblockedEvaluatorCount > 0) {
        await invalidateProjectEvalConfigCaches(input.projectId);
      }

      return defaultModel;
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
        const blockResult = await blockEvaluatorsUsingDefaultModel({
          tx,
          projectId: input.projectId,
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

      await finalizeEvaluatorBlocks({
        projectId: input.projectId,
        source: EvaluatorBlockSource.DEFAULT_EVAL_MODEL_DELETION,
        evaluatorIdsByReason: {
          [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]:
            result.blockedEvaluatorIds,
        },
      });

      return { success: true };
    }),
});
