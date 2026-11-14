import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/new/checkProjectAccess";
import {
  findSessionOrganization,
  getSessionUserId,
  getSessionUserV4BetaEnabled,
} from "@/src/features/rbac/new/sessionAccessors";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { ActionId, InvalidRequestError } from "@langfuse/shared";
import { CreateObservationBatchEvaluationActionSchema } from "../validation";
import { BatchEvaluationService } from "./batchEvaluationService";

export const runEvaluationRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateObservationBatchEvaluationActionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "evaluationRule:CUD",
        });

        if (
          input.evalVersion === "v2" &&
          getSessionUserV4BetaEnabled(ctx.session) !== true
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Evaluator v2 is only available in fast preview.",
          });
        }

        const service = new BatchEvaluationService(ctx.prisma, (batchAction) =>
          auditLog({
            session: ctx.session,
            resourceType: "batchAction",
            resourceId: batchAction.id,
            projectId: batchAction.projectId,
            action: ActionId.ObservationBatchEvaluation,
            after: batchAction,
          }),
        );

        const plan =
          findSessionOrganization(ctx.session, ctx.session.orgId)?.plan ?? null;

        return await service.create(input, {
          userId: getSessionUserId(ctx.session),
          plan,
        });
      } catch (e) {
        logger.error(e);
        if (e instanceof TRPCError) {
          throw e;
        }
        if (e instanceof InvalidRequestError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e.message,
            cause: e,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating run-evaluation action failed.",
        });
      }
    }),
});
