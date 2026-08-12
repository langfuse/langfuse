import {
  EvalTargetObject,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  validateEvaluatorFiltersForTarget,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import {
  JobConfigState,
  type Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import {
  ChatMessageRole,
  ChatMessageType,
  generateLangfuseAIText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  invalidateProjectEvalConfigCaches,
  logger,
} from "@langfuse/shared/src/server";
import { resolveLangfuseAiFeatureAvailability } from "@/src/features/ai-features/server/availability";
import {
  getRecentRuleExecutionTraces,
  getTotalCostByRule,
} from "@langfuse/shared/src/server";
import type {
  CreateRuleInput,
  ListRulesInput,
  RuleAssignmentInput,
  RuleSelectionInput,
  UpdateRuleInput,
} from "./ruleTypes";
import * as evaluatorRepository from "../evaluators/evaluatorRepository";
import { assertActiveRuleLimitNotExceeded } from "./ruleErrors";
import * as repository from "./ruleRepository";

export type RuleAuditEvent = {
  action: "create" | "update" | "delete";
  projectId: string;
  ruleId: string;
};

export class RuleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: (event: RuleAuditEvent) => Promise<void>,
  ) {}

  async list(input: ListRulesInput) {
    const { rules, totalItems } = await repository.listRules({
      prisma: this.prisma,
      input,
    });
    return { rules: rules.map(toRuleResponse), totalItems };
  }

  async get(projectId: string, ruleId: string) {
    const rule = await repository.findRule({
      prisma: this.prisma,
      projectId,
      ruleId,
    });
    if (!rule) throw new LangfuseNotFoundError("Evaluation rule not found");
    return toRuleResponse(rule);
  }

  async listRecent(params: { projectId: string; ruleIds: string[] }) {
    const result = Object.fromEntries(
      params.ruleIds.map((ruleId) => [ruleId, []]),
    ) as Record<string, Array<{ id: string; level: string; timestamp: Date }>>;
    if (params.ruleIds.length === 0) return result;

    const traces = await getRecentRuleExecutionTraces(
      params.projectId,
      params.ruleIds,
    );

    for (const { ruleId, ...trace } of traces) {
      result[ruleId]?.push(trace);
    }
    return result;
  }

  async getTotalCosts(params: { projectId: string; ruleIds: string[] }) {
    const costs = await getTotalCostByRule(params.projectId, params.ruleIds);
    return Object.fromEntries(
      costs.map(({ ruleId, totalCost }) => [ruleId, totalCost]),
    );
  }

  evaluatorOptions(params: {
    projectId: string;
    search?: string;
    limit: number;
  }) {
    return evaluatorRepository.listEvaluatorOptions({
      prisma: this.prisma,
      ...params,
    });
  }

  async listRulesForEvaluator(projectId: string, evaluatorId: string) {
    const exists = await evaluatorRepository.countProjectEvaluators({
      prisma: this.prisma,
      projectId,
      evaluatorIds: [evaluatorId],
    });
    if (exists !== 1) throw new LangfuseNotFoundError("Evaluator not found");
    return repository.listRulesForEvaluator({
      prisma: this.prisma,
      projectId,
      evaluatorId,
    });
  }

  countRulesForEvaluators(projectId: string, evaluatorIds: string[]) {
    return repository.countRulesForEvaluators({
      prisma: this.prisma,
      projectId,
      evaluatorIds,
    });
  }

  async suggestName(params: {
    projectId: string;
    filter: FilterState;
    sampling: number;
  }) {
    const filter = this.validateRuleFilters(
      EvalTargetObject.EVENT,
      params.filter,
    );
    const availability = await resolveLangfuseAiFeatureAvailability({
      prisma: this.prisma,
      projectId: params.projectId,
    });
    if (!availability.available) return null;

    try {
      const generated = await generateLangfuseAIText({
        messages: [
          {
            role: ChatMessageRole.System,
            content:
              "Return only a concise, human-readable evaluation rule name of at most six words. Describe the observation scope. Do not use quotes or punctuation at the end.",
            type: ChatMessageType.System,
          },
          {
            role: ChatMessageRole.User,
            content: JSON.stringify({
              filters: filter,
              samplingPercent: Math.round(params.sampling * 100),
            }),
            type: ChatMessageType.User,
          },
        ],
        model: availability.model,
        maxTokens: 40,
        timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
      });
      return (
        generated
          ?.trim()
          .replace(/^['\"]|['\"]$/g, "")
          .slice(0, 200) || null
      );
    } catch (error) {
      logger.warn("Evaluation rule name generation failed", {
        projectId: params.projectId,
        error,
      });
      return null;
    }
  }

  async create(input: CreateRuleInput, createdByUserId: string | null) {
    const filter = this.validateRuleFilters(input.targetObject, input.filter);
    this.assertUniqueAssignments(input.evaluatorAssignments);
    const rule = await this.prisma.$transaction(async (prisma) => {
      await assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: input.projectId,
        additionalActiveRules: input.enabled ? 1 : 0,
      });
      await this.assertEvaluatorsBelongToProject({
        prisma,
        projectId: input.projectId,
        assignments: input.evaluatorAssignments,
      });
      return repository.createRule({
        prisma,
        input: { ...input, filter },
        createdByUserId,
      });
    });
    await invalidateProjectEvalConfigCaches(input.projectId);
    const response = toRuleResponse(rule);
    await this.audit({
      action: "create",
      projectId: input.projectId,
      ruleId: response.id,
    });
    return response;
  }

  async update(input: UpdateRuleInput) {
    if (input.evaluatorMappings) {
      this.assertUniqueAssignments(input.evaluatorMappings);
    }
    const rule = await this.prisma.$transaction(async (prisma) => {
      const current = await this.requireRule(
        prisma,
        input.projectId,
        input.ruleId,
      );
      const filter =
        input.filter === undefined
          ? undefined
          : this.validateRuleFilters(
              current.targetObject as EvalTargetObject,
              input.filter,
            );
      await assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: input.projectId,
        additionalActiveRules:
          input.enabled === true && current.status !== JobConfigState.ACTIVE
            ? 1
            : 0,
      });
      if (input.evaluatorMappings) {
        await this.assertEvaluatorsBelongToProject({
          prisma,
          projectId: input.projectId,
          assignments: input.evaluatorMappings,
        });
      }
      await repository.updateRule({
        prisma,
        input,
        filter: filter as Prisma.InputJsonValue | undefined,
      });
      if (input.evaluatorMappings) {
        await repository.replaceAssignments({
          prisma,
          projectId: input.projectId,
          ruleId: input.ruleId,
          assignments: input.evaluatorMappings,
        });
      }
      const updated = await repository.findRule({
        prisma,
        projectId: input.projectId,
        ruleId: input.ruleId,
      });
      if (!updated)
        throw new LangfuseNotFoundError("Evaluation rule not found");
      return updated;
    });
    await invalidateProjectEvalConfigCaches(input.projectId);
    const response = toRuleResponse(rule);
    await this.audit({
      action: "update",
      projectId: input.projectId,
      ruleId: response.id,
    });
    return response;
  }

  async setEnabled(params: {
    projectId: string;
    ruleId: string;
    enabled: boolean;
    sampling?: number;
  }) {
    const rule = await this.prisma.$transaction(async (prisma) => {
      const current = await this.requireRule(
        prisma,
        params.projectId,
        params.ruleId,
      );
      await assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: params.projectId,
        additionalActiveRules:
          params.enabled && current.status !== JobConfigState.ACTIVE ? 1 : 0,
      });
      await repository.setRuleStatus({
        prisma,
        projectId: params.projectId,
        ruleIds: [params.ruleId],
        enabled: params.enabled,
        sampling: params.sampling,
      });
      const updated = await repository.findRule({
        prisma,
        projectId: params.projectId,
        ruleId: params.ruleId,
      });
      if (!updated)
        throw new LangfuseNotFoundError("Evaluation rule not found");
      return updated;
    });
    await invalidateProjectEvalConfigCaches(params.projectId);
    const response = toRuleResponse(rule);
    await this.audit({
      action: "update",
      projectId: params.projectId,
      ruleId: response.id,
    });
    return response;
  }

  async delete(projectId: string, ruleId: string) {
    const deleted = await this.prisma.$transaction((prisma) =>
      repository.deleteRule({ prisma, projectId, ruleId }),
    );
    if (!deleted) throw new LangfuseNotFoundError("Evaluation rule not found");
    await invalidateProjectEvalConfigCaches(projectId);
    await this.audit({ action: "delete", projectId, ruleId });
  }

  async deleteMany(input: RuleSelectionInput) {
    const ruleIds = await this.prisma.$transaction(async (prisma) => {
      const ids = await repository.listSelectedRuleIds({ prisma, input });
      await prisma.evaluationRule.deleteMany({
        where: { projectId: input.projectId, id: { in: ids } },
      });
      return ids;
    });
    await invalidateProjectEvalConfigCaches(input.projectId);
    await Promise.all(
      ruleIds.map((ruleId) =>
        this.audit({
          action: "delete",
          projectId: input.projectId,
          ruleId,
        }),
      ),
    );
    return ruleIds;
  }

  async setManyEnabled(input: RuleSelectionInput & { enabled: boolean }) {
    const ruleIds = await this.prisma.$transaction(async (prisma) => {
      const selection: RuleSelectionInput =
        "ruleIds" in input
          ? { projectId: input.projectId, ruleIds: input.ruleIds }
          : {
              projectId: input.projectId,
              isBatchAction: true,
              search: input.search,
            };
      const ids = await repository.listSelectedRuleIds({
        prisma,
        input: selection,
      });
      if (input.enabled) {
        // Only rules that are not already active consume a new slot.
        const newlyActivated = await prisma.evaluationRule.count({
          where: {
            projectId: input.projectId,
            id: { in: ids },
            status: { not: JobConfigState.ACTIVE },
          },
        });
        await assertActiveRuleLimitNotExceeded({
          prisma,
          projectId: input.projectId,
          additionalActiveRules: newlyActivated,
        });
      }
      await prisma.evaluationRule.updateMany({
        where: { projectId: input.projectId, id: { in: ids } },
        data: { status: input.enabled ? "ACTIVE" : "INACTIVE" },
      });
      return ids;
    });
    await invalidateProjectEvalConfigCaches(input.projectId);
    await Promise.all(
      ruleIds.map((ruleId) =>
        this.audit({
          action: "update",
          projectId: input.projectId,
          ruleId,
        }),
      ),
    );
    return ruleIds;
  }

  async attach(params: {
    projectId: string;
    ruleId: string;
    assignment: RuleAssignmentInput;
  }) {
    await this.prisma.$transaction(async (prisma) => {
      await this.requireRule(prisma, params.projectId, params.ruleId);
      await this.assertEvaluatorsBelongToProject({
        prisma,
        projectId: params.projectId,
        assignments: [params.assignment],
      });
      await repository.attachEvaluator({ prisma, ...params });
    });
    await invalidateProjectEvalConfigCaches(params.projectId);
    const rule = await this.get(params.projectId, params.ruleId);
    await this.audit({
      action: "update",
      projectId: params.projectId,
      ruleId: params.ruleId,
    });
    return rule;
  }

  async detach(params: {
    projectId: string;
    ruleId: string;
    evaluatorId: string;
  }) {
    const deleted = await this.prisma.$transaction(async (prisma) => {
      await this.requireRule(prisma, params.projectId, params.ruleId);
      return repository.detachEvaluator({ prisma, ...params });
    });
    if (!deleted) throw new LangfuseNotFoundError("Assignment not found");
    await invalidateProjectEvalConfigCaches(params.projectId);
    const rule = await this.get(params.projectId, params.ruleId);
    await this.audit({
      action: "update",
      projectId: params.projectId,
      ruleId: params.ruleId,
    });
    return rule;
  }

  private validateRuleFilters(targetObject: EvalTargetObject, filter: unknown) {
    const result = validateEvaluatorFiltersForTarget({
      targetObject,
      filter,
    });
    if (!result.isValid) {
      throw new InvalidRequestError(
        result.issues.map(({ message }) => message).join(" "),
      );
    }
    return result.validatedFilters;
  }

  private async requireRule(
    prisma: Prisma.TransactionClient,
    projectId: string,
    ruleId: string,
  ) {
    const rule = await repository.findRule({ prisma, projectId, ruleId });
    if (!rule) throw new LangfuseNotFoundError("Evaluation rule not found");
    return rule;
  }

  private assertUniqueAssignments(assignments: RuleAssignmentInput[]) {
    const ids = assignments.map(({ evaluatorId }) => evaluatorId);
    if (new Set(ids).size !== ids.length) {
      throw new LangfuseConflictError(
        "An evaluator can only be attached once to an evaluation rule",
      );
    }
  }

  private async assertEvaluatorsBelongToProject(params: {
    prisma: Prisma.TransactionClient;
    projectId: string;
    assignments: RuleAssignmentInput[];
  }) {
    const evaluatorIds = params.assignments.map(
      ({ evaluatorId }) => evaluatorId,
    );
    const count = await evaluatorRepository.countProjectEvaluators({
      prisma: params.prisma,
      projectId: params.projectId,
      evaluatorIds,
    });
    if (count !== evaluatorIds.length) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
  }
}

type StoredRule = NonNullable<Awaited<ReturnType<typeof repository.findRule>>>;

function toRuleResponse(rule: StoredRule) {
  const { status, assignments, filter, sampling, ...rest } = rule;
  return {
    ...rest,
    enabled: status === JobConfigState.ACTIVE,
    filter: filter as FilterState,
    sampling: sampling.toNumber(),
    assignments: assignments.map(
      ({ evaluator, variableMapping, ...assignment }) => {
        const { versions, ...evaluatorMetadata } = evaluator;
        const latestVersion = versions[0];
        return {
          ...assignment,
          variableMapping: variableMapping as
            | ObservationVariableMapping[]
            | null,
          evaluator: {
            ...evaluatorMetadata,
            latestVersion: latestVersion
              ? {
                  ...latestVersion,
                  variableMapping: latestVersion.variableMapping as
                    | ObservationVariableMapping[]
                    | null,
                }
              : null,
          },
        };
      },
    ),
  };
}
