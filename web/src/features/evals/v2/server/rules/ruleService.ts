import {
  EvalTemplateType,
  EvalTargetObject,
  InvalidRequestError,
  isExperimentEvaluationRule,
  LangfuseConflictError,
  LangfuseNotFoundError,
  normalizeEvaluationRuleTarget,
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
  getRecentRuleExecutionTraces,
  getTotalCostByRule,
} from "@langfuse/shared/src/server";
import { resolveLangfuseAiFeatureAvailability } from "@/src/features/ai-features/server/availability";
import type {
  CreateOrAttachFromEvaluatorFiltersInput,
  CreateRuleInput,
  ListRulesInput,
  RuleAssignmentInput,
  RuleSelectionInput,
  UpdateRuleInput,
} from "./ruleTypes";
import * as evaluatorRepository from "../evaluators/evaluatorRepository";
import { reconcileEvaluatorPromptMessages } from "../evaluators/evaluatorService";
import {
  assertActiveRuleLimitNotExceeded,
  assertEnabledRuleHasAssignments,
} from "./ruleErrors";
import * as repository from "./ruleRepository";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import {
  assertCompleteEvaluatorVariableMapping,
  extractEvaluatorPromptVariables,
} from "../evaluators/evaluatorValidation";
import { fallbackRuleName, filterStateKey } from "./ruleFilterMatching";

const MAX_REUSABLE_FILTERS = 10;

export type RuleAuditEvent = {
  action: "create" | "update" | "delete";
  projectId: string;
  ruleId: string;
};

type RuleServiceUpdateInput = UpdateRuleInput & {
  targetObject?: EvalTargetObject;
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

  async listCursor(
    input: Omit<ListRulesInput, "page"> & {
      cursor?: { createdAt: Date; id: string };
    },
  ) {
    const { rules, nextCursor } = await repository.listRulesCursor({
      prisma: this.prisma,
      input,
    });
    return { rules: rules.map(toRuleResponse), nextCursor };
  }

  listFilterOptions(projectId: string) {
    return repository.listRuleFilterOptions({
      prisma: this.prisma,
      projectId,
    });
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

  async listReusableFilters(projectId: string) {
    const candidates = await repository.listReusableFilterCandidates({
      prisma: this.prisma,
      projectId,
    });
    // FilterState equality ignores condition order and multi-value order. A SQL
    // JSONB GROUP BY would need to canonicalize both array levels first, so the
    // service owns semantic deduplication and ranking over repository rows.
    const grouped = new Map<
      string,
      {
        latestRuleId: string;
        filter: FilterState;
        updatedAt: Date;
        evaluatorIds: Set<string>;
      }
    >();

    for (const candidate of candidates) {
      const filter = candidate.filter as FilterState;
      if (filter.length === 0) continue;
      const key = filterStateKey(filter);
      const group = grouped.get(key) ?? {
        latestRuleId: candidate.id,
        filter,
        updatedAt: candidate.updatedAt,
        evaluatorIds: new Set<string>(),
      };
      if (candidate.updatedAt > group.updatedAt) {
        group.latestRuleId = candidate.id;
        group.filter = filter;
        group.updatedAt = candidate.updatedAt;
      }
      for (const { evaluatorId } of candidate.assignments) {
        group.evaluatorIds.add(evaluatorId);
      }
      grouped.set(key, group);
    }

    return [...grouped.values()]
      .map(({ evaluatorIds, ...group }) => ({
        ...group,
        evaluatorCount: evaluatorIds.size,
      }))
      .sort(
        (left, right) =>
          right.evaluatorCount - left.evaluatorCount ||
          right.updatedAt.getTime() - left.updatedAt.getTime(),
      )
      .slice(0, MAX_REUSABLE_FILTERS);
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
    const normalized = normalizeEvaluationRuleTarget({
      targetObject: input.targetObject,
      filter: input.filter,
    });
    const filter = this.validateRuleFilters(
      normalized.targetObject,
      normalized.filter,
    );
    this.assertUniqueAssignments(input.evaluatorAssignments);
    assertEnabledRuleHasAssignments({
      enabled: input.enabled,
      assignmentCount: input.evaluatorAssignments.length,
    });
    const rule = await this.prisma.$transaction(async (prisma) => {
      await assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: input.projectId,
        additionalActiveRules: input.enabled ? 1 : 0,
      });
      const evaluatorAssignments = await this.prepareModernAssignments({
        prisma,
        projectId: input.projectId,
        assignments: input.evaluatorAssignments,
      });
      return repository.createRule({
        prisma,
        input: {
          ...input,
          evaluatorAssignments,
          targetObject:
            normalized.targetObject as CreateRuleInput["targetObject"],
          filter,
        },
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

  async createOrAttachFromEvaluatorFilters(
    input: CreateOrAttachFromEvaluatorFiltersInput,
    createdByUserId: string | null,
  ) {
    const filter = this.validateRuleFilters(
      EvalTargetObject.EVENT,
      input.filter,
    );
    const attachToMatch = async () => {
      const matchingRule =
        await repository.findActiveRuleWithMatchingFilterAndSampling({
          prisma: this.prisma,
          projectId: input.projectId,
          filter,
          sampling: input.sampling,
        });
      if (!matchingRule) return null;

      if (
        matchingRule.assignments.some(
          (assignment) => assignment.evaluatorId === input.evaluatorId,
        )
      ) {
        return this.get(input.projectId, matchingRule.id);
      }

      return this.attach({
        projectId: input.projectId,
        ruleId: matchingRule.id,
        assignment: { evaluatorId: input.evaluatorId, variableMapping: null },
      });
    };

    const existingRule = await attachToMatch();
    if (existingRule)
      return { action: "attached" as const, rule: existingRule };

    const suggestedName = await this.suggestName({
      projectId: input.projectId,
      filter,
      sampling: input.sampling,
    });

    // Check again after name generation because another request may have
    // created a matching rule while the AI suggestion was in flight.
    const concurrentlyCreatedRule = await attachToMatch();
    if (concurrentlyCreatedRule) {
      return { action: "attached" as const, rule: concurrentlyCreatedRule };
    }

    const rule = await this.create(
      {
        projectId: input.projectId,
        name: suggestedName ?? fallbackRuleName(filter),
        targetObject: EvalTargetObject.EVENT,
        filter,
        sampling: input.sampling,
        enabled: true,
        evaluatorAssignments: [
          { evaluatorId: input.evaluatorId, variableMapping: null },
        ],
      },
      createdByUserId,
    );
    return { action: "created" as const, rule };
  }

  async update(input: RuleServiceUpdateInput) {
    if (input.evaluatorMappings) {
      this.assertUniqueAssignments(input.evaluatorMappings);
    }
    const rule = await this.prisma.$transaction(async (prisma) => {
      const current = await this.requireRule(
        prisma,
        input.projectId,
        input.ruleId,
      );
      this.assertLegacyRuleUpdateAllowed(current.targetObject, input);
      const resultingAssignmentCount =
        input.evaluatorMappings?.length ?? current.assignments.length;
      assertEnabledRuleHasAssignments({
        enabled:
          input.enabled ??
          (input.evaluatorMappings?.length === 0
            ? false
            : current.status === JobConfigState.ACTIVE),
        assignmentCount: resultingAssignmentCount,
      });
      const currentTargetObject = current.targetObject as EvalTargetObject;
      const currentFilter = current.filter as FilterState;
      // Whether a rule targets experiments is derived from its filter, so an
      // update that supplies a filter re-decides it — otherwise removing the
      // experiment-root filter would be silently undone. Only an update that
      // leaves the filter alone inherits the stored classification.
      const effectiveFilter = (input.filter ?? currentFilter) as FilterState;
      const inheritedTargetObject =
        input.filter === undefined &&
        isExperimentEvaluationRule({
          targetObject: currentTargetObject,
          filter: currentFilter,
        })
          ? EvalTargetObject.EXPERIMENT
          : currentTargetObject;
      const normalized = normalizeEvaluationRuleTarget({
        targetObject: input.targetObject ?? inheritedTargetObject,
        filter: effectiveFilter,
      });
      const filter = isLegacyEvalTarget(currentTargetObject)
        ? currentFilter
        : this.validateRuleFilters(normalized.targetObject, normalized.filter);
      await assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: input.projectId,
        additionalActiveRules:
          input.enabled === true && current.status !== JobConfigState.ACTIVE
            ? 1
            : 0,
      });
      if (input.evaluatorMappings) {
        this.assertLegacyRuleAssignmentsWritable(current.targetObject);
        input.evaluatorMappings = await this.prepareModernAssignments({
          prisma,
          projectId: input.projectId,
          assignments: input.evaluatorMappings,
        });
      }
      await repository.updateRule({
        prisma,
        input,
        targetObject: normalized.targetObject,
        filter: filter as Prisma.InputJsonValue,
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
      this.assertLegacyRuleCanBeEnabled(current.targetObject, params.enabled);
      assertEnabledRuleHasAssignments({
        enabled: params.enabled,
        assignmentCount: current.assignments.length,
      });
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
      await repository.deleteRules({
        prisma,
        projectId: input.projectId,
        ruleIds: ids,
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
              filter: input.filter,
            };
      const ids = await repository.listSelectedRuleIds({
        prisma,
        input: selection,
      });
      const legacyRuleCount = await prisma.evaluationRule.count({
        where: {
          projectId: input.projectId,
          id: { in: ids },
          targetObject: {
            in: [EvalTargetObject.TRACE, EvalTargetObject.DATASET],
          },
        },
      });
      if (legacyRuleCount > 0) {
        this.assertLegacyRuleCanBeEnabled("trace", input.enabled);
      }
      if (input.enabled) {
        const unassignedRule = await prisma.evaluationRule.findFirst({
          where: {
            projectId: input.projectId,
            id: { in: ids },
            assignments: { none: {} },
          },
          select: { id: true },
        });
        assertEnabledRuleHasAssignments({
          enabled: true,
          assignmentCount: unassignedRule ? 0 : 1,
        });
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
    enableRule?: boolean;
  }) {
    await this.prisma.$transaction(async (prisma) => {
      const rule = await this.requireRule(
        prisma,
        params.projectId,
        params.ruleId,
      );
      this.assertLegacyRuleAssignmentsWritable(rule.targetObject);
      const [assignment] = await this.prepareModernAssignments({
        prisma,
        projectId: params.projectId,
        assignments: [params.assignment],
      });
      await repository.attachEvaluator({
        prisma,
        projectId: params.projectId,
        ruleId: params.ruleId,
        assignment: assignment!,
      });
      if (params.enableRule) {
        this.assertLegacyRuleCanBeEnabled(rule.targetObject, true);
        await assertActiveRuleLimitNotExceeded({
          prisma,
          projectId: params.projectId,
          additionalActiveRules: rule.status === JobConfigState.ACTIVE ? 0 : 1,
        });
        await repository.setRuleStatus({
          prisma,
          projectId: params.projectId,
          ruleIds: [params.ruleId],
          enabled: true,
        });
      }
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

  private assertLegacyRuleCanBeEnabled(targetObject: string, enabled: boolean) {
    if (enabled && isLegacyEvalTarget(targetObject)) {
      throw new InvalidRequestError(
        "Legacy evaluation rules cannot be re-enabled",
      );
    }
  }

  private assertLegacyRuleUpdateAllowed(
    targetObject: string,
    input: RuleServiceUpdateInput,
  ) {
    if (!isLegacyEvalTarget(targetObject)) return;
    if (input.evaluatorMappings !== undefined) {
      this.assertLegacyRuleAssignmentsWritable(targetObject);
    }
    if (
      input.enabled !== false ||
      input.name !== undefined ||
      input.filter !== undefined ||
      input.sampling !== undefined ||
      input.targetObject !== undefined
    ) {
      throw new InvalidRequestError(
        "Legacy evaluation rules can only be deactivated or deleted",
      );
    }
  }

  private assertLegacyRuleAssignmentsWritable(targetObject: string) {
    if (isLegacyEvalTarget(targetObject)) {
      throw new InvalidRequestError(
        "Evaluator assignments on legacy evaluation rules are read-only",
      );
    }
  }

  private async prepareModernAssignments(params: {
    prisma: Prisma.TransactionClient;
    projectId: string;
    assignments: RuleAssignmentInput[];
  }) {
    const evaluatorIds = params.assignments.map(
      ({ evaluatorId }) => evaluatorId,
    );
    const evaluators = await evaluatorRepository.findEvaluatorsByIds({
      prisma: params.prisma,
      projectId: params.projectId,
      evaluatorIds,
    });
    if (evaluators.length !== evaluatorIds.length) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
    const evaluatorById = new Map(
      evaluators.map((evaluator) => [evaluator.id, evaluator]),
    );
    return params.assignments.map((assignment) => {
      const evaluator = evaluatorById.get(assignment.evaluatorId)!;
      const latestVersion = evaluator.versions[0];
      if (!latestVersion) {
        throw new LangfuseNotFoundError("Evaluator version not found");
      }
      if (evaluator.type === EvalTemplateType.CODE) {
        if (assignment.variableMapping !== null) {
          throw new InvalidRequestError(
            "Code evaluator mappings are managed by Langfuse and cannot be provided.",
          );
        }
        return {
          ...assignment,
          variableMapping: null,
        };
      }
      const prepared = prepareModernRuleVariableMapping(
        latestVersion.variableMapping,
        evaluator.type,
      );
      const storedVariableMapping =
        assignment.variableMapping ?? prepared.initialVariableMapping;
      const promptMessages = reconcileEvaluatorPromptMessages({
        prompt: latestVersion.prompt,
        promptMessages: latestVersion.promptMessages,
      });
      assertCompleteEvaluatorVariableMapping({
        promptVariables: extractEvaluatorPromptVariables(promptMessages),
        variableMapping:
          storedVariableMapping ?? prepared.defaultVariableMapping,
      });
      return {
        ...assignment,
        variableMapping: storedVariableMapping,
      };
    });
  }
}

type StoredRule = NonNullable<Awaited<ReturnType<typeof repository.findRule>>>;

function toRuleResponse(rule: StoredRule) {
  const { status, assignments, filter, sampling, ...rest } = rule;
  const normalized = normalizeEvaluationRuleTarget({
    targetObject: rest.targetObject as EvalTargetObject,
    filter: filter as FilterState,
  });
  return {
    ...rest,
    targetObject: normalized.targetObject,
    enabled: status === JobConfigState.ACTIVE,
    filter: normalized.filter,
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
