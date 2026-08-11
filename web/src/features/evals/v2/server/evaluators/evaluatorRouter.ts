import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  type ProjectAuthedContext,
} from "@/src/server/api/trpc";
import { z } from "zod";
import {
  CreateEvaluatorSchema,
  DeleteEvaluatorsSchema,
  EvaluatorDefinitionSchema,
  EvaluatorIdSchema,
  EvaluatorIdsSchema,
  EvaluatorVersionsSchema,
  ListEvaluatorsSchema,
  SuggestEvaluatorNameSchema,
  UpdateEvaluatorSchema,
} from "./evaluatorTypes";
import { EvaluatorService } from "./evaluatorService";

const TestEvaluatorSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string().optional(),
  definition: EvaluatorDefinitionSchema,
  observationId: z.string(),
  traceId: z.string(),
  startTime: z.coerce.date(),
});

function serviceForContext(ctx: ProjectAuthedContext) {
  return new EvaluatorService({
    prisma: ctx.prisma,
    audit: ({ action, evaluatorId }) =>
      auditEvaluator(ctx, action, evaluatorId),
  });
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
  list: protectedProjectProcedure
    .input(ListEvaluatorsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });
      return serviceForContext(ctx).list(input);
    }),

  get: protectedProjectProcedure
    .input(EvaluatorIdSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });
      return serviceForContext(ctx).get(input.projectId, input.evaluatorId);
    }),

  versions: protectedProjectProcedure
    .input(EvaluatorVersionsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });
      return serviceForContext(ctx).listVersions(input);
    }),

  recentExecutions: protectedProjectProcedure
    .input(EvaluatorIdsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });
      return serviceForContext(ctx).listRecent(input);
    }),

  costByEvaluatorIds: protectedProjectProcedure
    .input(EvaluatorIdsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });
      return serviceForContext(ctx).getTotalCosts(input);
    }),

  create: protectedProjectProcedure
    .input(CreateEvaluatorSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:CUD",
      });
      const service = serviceForContext(ctx);
      return service.create(input, ctx.session.user.id);
    }),

  update: protectedProjectProcedure
    .input(UpdateEvaluatorSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:CUD",
      });
      const service = serviceForContext(ctx);
      return service.update(input, ctx.session.user.id);
    }),

  delete: protectedProjectProcedure
    .input(EvaluatorIdSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:CUD",
      });
      const service = serviceForContext(ctx);
      await service.delete(input.projectId, input.evaluatorId);
      return { success: true };
    }),

  deleteMany: protectedProjectProcedure
    .input(DeleteEvaluatorsSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:CUD",
      });
      const service = serviceForContext(ctx);
      await service.deleteMany(input);
      return { success: true };
    }),

  test: protectedProjectProcedure
    .input(TestEvaluatorSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:CUD",
      });
      return serviceForContext(ctx).testEvaluator({
        orgId: ctx.session.orgId,
        projectId: input.projectId,
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
    .input(SuggestEvaluatorNameSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:CUD",
      });
      return serviceForContext(ctx).suggestName({
        ...input,
        userId: ctx.session.user.id,
      });
    }),
});
