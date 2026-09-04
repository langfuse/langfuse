import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  CreateObservationBatchEvaluationActionSchema,
  CreateObservationEvaluatorBackfillActionSchema,
} from "@/src/features/batch-actions/validation";
import { createBatchEvaluation } from "@/src/features/batch-actions/server/createBatchEvaluation";

function assertEvaluationWriteAccess(
  session: Parameters<typeof throwIfNoProjectAccess>[0]["session"],
  projectId: string,
) {
  throwIfNoProjectAccess({
    session,
    projectId,
    scope: "evaluationRule:CUD",
  });
}

export const runEvaluationRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateObservationBatchEvaluationActionSchema)
    .mutation(({ input, ctx }) => {
      assertEvaluationWriteAccess(ctx.session, input.projectId);
      return createBatchEvaluation({ input, ctx });
    }),
  createBackfill: protectedProjectProcedure
    .input(CreateObservationEvaluatorBackfillActionSchema)
    .mutation(({ input, ctx }) => {
      assertEvaluationWriteAccess(ctx.session, input.projectId);
      return createBatchEvaluation({ input, ctx });
    }),
});
