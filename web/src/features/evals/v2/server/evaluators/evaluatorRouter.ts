import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  type ProjectAuthedContext,
} from "@/src/server/api/trpc";
import { z } from "zod";
import {
  ActivationCostEstimatesSchema,
  CreateEvaluatorSchema,
  DeleteEvaluatorsSchema,
  EvaluatorDefinitionInputSchema,
  EvaluatorIdSchema,
  EvaluatorIdsSchema,
  EvaluatorOptionsSchema,
  EvaluatorVersionsSchema,
  ListEvaluatorsSchema,
  SuggestEvaluatorTextSchema,
  UpdateEvaluatorSchema,
} from "./evaluatorTypes";
import { EvaluatorService } from "./evaluatorService";
import { ruleRouter } from "../rules/ruleRouter";
import { getActivationCostEstimates } from "./activationCostService";

const TestEvaluatorSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string(),
  definition: EvaluatorDefinitionInputSchema,
  observationId: z.string(),
  traceId: z.string(),
  startTime: z.coerce.date(),
});

function serviceForContext(ctx: ProjectAuthedContext) {
  return new EvaluatorService(ctx.prisma, ({ action, evaluatorId }) =>
    auditEvaluator(ctx, action, evaluatorId),
  );
}

function auditEvaluator(
  ctx: ProjectAuthedContext,
  action: "create" | "update" | "delete",
  evaluatorId: string,
) {
  return auditLog({
    session: ctx.session,
    resourceType: "evalTemplate",
    resourceId: evaluatorId,
    action,
  });
}

export const evaluatorRouter = createTRPCRouter({
  rules: ruleRouter,
  list: protectedProjectProcedure
    .input(ListEvaluatorsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:read",
      });
      return serviceForContext(ctx).list({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  filterOptions: protectedProjectProcedure
    .input(ListEvaluatorsSchema.pick({ projectId: true }))
    .query(({ ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:read",
      });
      return serviceForContext(ctx).listFilterOptions(ctx.session.projectId);
    }),

  options: protectedProjectProcedure
    .input(EvaluatorOptionsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:read",
      });
      return serviceForContext(ctx).listOptions({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  get: protectedProjectProcedure
    .input(EvaluatorIdSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:read",
      });
      return serviceForContext(ctx).getWithSampleFilter(
        ctx.session.projectId,
        input.evaluatorId,
      );
    }),

  versions: protectedProjectProcedure
    .input(EvaluatorVersionsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:read",
      });
      return serviceForContext(ctx).listVersions({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  recentExecutions: protectedProjectProcedure
    .input(EvaluatorIdsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalJob:read",
      });
      return serviceForContext(ctx).listRecent({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  costByEvaluatorIds: protectedProjectProcedure
    .input(EvaluatorIdsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalJob:read",
      });
      return serviceForContext(ctx).getTotalCosts({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  activationCostEstimates: protectedProjectProcedure
    .input(ActivationCostEstimatesSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalJob:CUD",
      });
      return getActivationCostEstimates({
        ...input,
        projectId: ctx.session.projectId,
        orgId: ctx.session.orgId,
        shouldReadFromObservationsTable:
          ctx.session.user.v4BetaEnabled !== true,
      });
    }),

  create: protectedProjectProcedure
    .input(CreateEvaluatorSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:CUD",
      });
      const service = serviceForContext(ctx);
      return service.create(
        { ...input, projectId: ctx.session.projectId },
        ctx.session.user.id,
      );
    }),

  update: protectedProjectProcedure
    .input(UpdateEvaluatorSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:CUD",
      });
      const service = serviceForContext(ctx);
      return service.update(
        { ...input, projectId: ctx.session.projectId },
        ctx.session.user.id,
      );
    }),

  reactivate: protectedProjectProcedure
    .input(EvaluatorIdSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:CUD",
      });
      return serviceForContext(ctx).reactivate({
        projectId: ctx.session.projectId,
        evaluatorId: input.evaluatorId,
      });
    }),

  delete: protectedProjectProcedure
    .input(EvaluatorIdSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:CUD",
      });
      const service = serviceForContext(ctx);
      await service.delete(ctx.session.projectId, input.evaluatorId);
      return { success: true };
    }),

  deleteMany: protectedProjectProcedure
    .input(DeleteEvaluatorsSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:CUD",
      });
      const service = serviceForContext(ctx);
      await service.deleteMany({
        ...input,
        projectId: ctx.session.projectId,
      });
      return { success: true };
    }),

  test: protectedProjectProcedure
    .input(TestEvaluatorSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:CUD",
      });
      return serviceForContext(ctx).testEvaluator({
        orgId: ctx.session.orgId,
        projectId: ctx.session.projectId,
        evaluatorId: input.evaluatorId,
        definition: input.definition,
        observationId: input.observationId,
        traceId: input.traceId,
        startTime: input.startTime,
        shouldReadFromObservationsTable:
          ctx.session.user.v4BetaEnabled !== true,
      });
    }),

  suggestName: protectedProjectProcedure
    .input(SuggestEvaluatorTextSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:CUD",
      });
      return serviceForContext(ctx).suggestName({
        ...input,
        projectId: ctx.session.projectId,
        userId: ctx.session.user.id,
      });
    }),

  suggestDescription: protectedProjectProcedure
    .input(SuggestEvaluatorTextSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalTemplate:CUD",
      });
      return serviceForContext(ctx).suggestDescription({
        ...input,
        projectId: ctx.session.projectId,
        userId: ctx.session.user.id,
      });
    }),
});
