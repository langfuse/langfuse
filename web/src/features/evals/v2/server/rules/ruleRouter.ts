import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  type ProjectAuthedContext,
} from "@/src/server/api/trpc";
import { RuleService } from "./ruleService";
import {
  CreateOrAttachFromEvaluatorFiltersSchema,
  CreateRuleSchema,
  EvaluatorRulesSchema,
  ListRulesSchema,
  RuleAssignmentIdSchema,
  RuleAssignmentSchema,
  RuleIdSchema,
  RuleIdsSchema,
  RuleSelectionSchema,
  SetRuleEnabledSchema,
  SetRulesEnabledSchema,
  SuggestRuleNameSchema,
  UpdateRuleSchema,
} from "./ruleTypes";

function serviceForContext(ctx: ProjectAuthedContext) {
  return new RuleService(ctx.prisma, ({ action, ruleId }) =>
    auditLog({
      session: ctx.session,
      resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
      resourceId: ruleId,
      action,
    }),
  );
}

export const ruleRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(ListRulesSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:read",
      });
      return serviceForContext(ctx).list({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  filterOptions: protectedProjectProcedure
    .input(ListRulesSchema.pick({ projectId: true }))
    .query(({ ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:read",
      });
      return serviceForContext(ctx).listFilterOptions(ctx.session.projectId);
    }),

  reusableFilters: protectedProjectProcedure
    .input(ListRulesSchema.pick({ projectId: true }))
    .query(({ ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:read",
      });
      return serviceForContext(ctx).listReusableFilters(ctx.session.projectId);
    }),

  get: protectedProjectProcedure.input(RuleIdSchema).query(({ input, ctx }) => {
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: ctx.session.projectId,
      scope: "evaluationRule:read",
    });
    return serviceForContext(ctx).get(ctx.session.projectId, input.ruleId);
  }),

  recentExecutions: protectedProjectProcedure
    .input(RuleIdsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalJobExecution:read",
      });
      return serviceForContext(ctx).listRecent({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  costByRuleIds: protectedProjectProcedure
    .input(RuleIdsSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evalJobExecution:read",
      });
      return serviceForContext(ctx).getTotalCosts({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  listRulesForEvaluator: protectedProjectProcedure
    .input(EvaluatorRulesSchema)
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:read",
      });
      return serviceForContext(ctx).listRulesForEvaluator(
        ctx.session.projectId,
        input.evaluatorId,
      );
    }),

  suggestName: protectedProjectProcedure
    .input(SuggestRuleNameSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      return serviceForContext(ctx).suggestName({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  create: protectedProjectProcedure
    .input(CreateRuleSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      return serviceForContext(ctx).create(
        { ...input, projectId: ctx.session.projectId },
        ctx.session.user.id,
      );
    }),

  createOrAttachFromEvaluatorFilters: protectedProjectProcedure
    .input(CreateOrAttachFromEvaluatorFiltersSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      return serviceForContext(ctx).createOrAttachFromEvaluatorFilters(
        { ...input, projectId: ctx.session.projectId },
        ctx.session.user.id,
      );
    }),

  update: protectedProjectProcedure
    .input(UpdateRuleSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      return serviceForContext(ctx).update({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  setEnabled: protectedProjectProcedure
    .input(SetRuleEnabledSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      return serviceForContext(ctx).setEnabled({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),

  delete: protectedProjectProcedure
    .input(RuleIdSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      await serviceForContext(ctx).delete(ctx.session.projectId, input.ruleId);
      return { success: true };
    }),

  deleteMany: protectedProjectProcedure
    .input(RuleSelectionSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      const ruleIds = await serviceForContext(ctx).deleteMany({
        ...input,
        projectId: ctx.session.projectId,
      });
      return { success: true, ruleIds };
    }),

  setManyEnabled: protectedProjectProcedure
    .input(SetRulesEnabledSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      const ruleIds = await serviceForContext(ctx).setManyEnabled({
        ...input,
        projectId: ctx.session.projectId,
      });
      return { success: true, ruleIds };
    }),

  attach: protectedProjectProcedure
    .input(RuleAssignmentSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      return serviceForContext(ctx).attach({
        projectId: ctx.session.projectId,
        ruleId: input.ruleId,
        assignment: {
          evaluatorId: input.evaluatorId,
          variableMapping: input.variableMapping,
        },
        enableRule: input.enableRule,
      });
    }),

  detach: protectedProjectProcedure
    .input(RuleAssignmentIdSchema)
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "evaluationRule:CUD",
      });
      return serviceForContext(ctx).detach({
        ...input,
        projectId: ctx.session.projectId,
      });
    }),
});
