import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod/v4";
import { JobConfigState, ZodModelConfig } from "@langfuse/shared";
import { DefaultEvalModelService } from "@langfuse/shared/src/server";

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
        statusReason: z
          .object({ code: z.string(), description: z.string() })
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalDefaultModel:CUD",
      });

      const statusReason = input.statusReason ?? {
        code: "DEFAULT_MODEL_REMOVED",
        description:
          "The default evaluation model was removed. Set a new default model or configure a model on each evaluator template.",
      };

      return ctx.prisma.$transaction(async (tx) => {
        const evalTemplates = await tx.evalTemplate.findMany({
          where: {
            OR: [{ projectId: input.projectId }, { projectId: null }],
            provider: null,
            model: null,
          },
        });

        if (evalTemplates.length > 0) {
          await tx.evalTemplate.updateMany({
            where: { id: { in: evalTemplates.map((et) => et.id) } },
            data: {
              status: "ERROR",
              statusReason,
              statusUpdatedAt: new Date(),
            },
          });
        }

        await tx.jobConfiguration.updateMany({
          where: {
            evalTemplateId: { in: evalTemplates.map((et) => et.id) },
            projectId: input.projectId,
          },
          data: {
            status: JobConfigState.INACTIVE,
          },
        });

        await tx.defaultLlmModel.delete({
          where: {
            projectId: input.projectId,
          },
        });

        return { success: true };
      });
    }),
});
