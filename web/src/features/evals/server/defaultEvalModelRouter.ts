import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod/v4";
import {
  InvalidRequestError,
  LangfuseNotFoundError,
  ZodModelConfig,
} from "@langfuse/shared";
import { DefaultEvalModelService } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

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

      try {
        return DefaultEvalModelService.upsertDefaultModel(input);
      } catch (error) {
        if (error instanceof InvalidRequestError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        } else if (error instanceof LangfuseNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),
  deleteDefaultModel: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalDefaultModel:CUD",
      });

      // Invalidate all eval jobs that rely on the default model
      return ctx.prisma.$transaction(async (tx) => {
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
          },
        });

        // Delete the default model within the transaction
        await tx.defaultLlmModel.delete({
          // unique constraint on projectId
          where: {
            projectId: input.projectId,
          },
        });

        return { success: true };
      });
    }),
});
