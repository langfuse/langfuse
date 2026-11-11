import { DefaultEvalModelService } from "@langfuse/shared/src/server";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod";

import { ZodModelConfig } from "@langfuse/shared";
import {
  deleteDefaultEvalModel,
  upsertDefaultEvalModel,
} from "@/src/features/evals/server/defaultEvalModelService";

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

      return upsertDefaultEvalModel({
        projectId: input.projectId,
        provider: input.provider,
        model: input.model,
        modelParams: input.modelParams,
        actor: { session: ctx.session },
      });
    }),
  deleteDefaultModel: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalDefaultModel:CUD",
      });

      return deleteDefaultEvalModel({
        projectId: input.projectId,
        actor: { session: ctx.session },
      });
    }),
});
