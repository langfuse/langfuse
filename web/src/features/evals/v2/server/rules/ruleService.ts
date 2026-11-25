import {
  EvalTargetObject,
  EvalTemplateType,
  extractTranscriptEvalVariables,
  InvalidRequestError,
  isTraceTranscriptEvalType,
  isExperimentEvaluationRule,
  LangfuseConflictError,
  LangfuseNotFoundError,
  normalizeEvaluationRuleTarget,
  TopicsTargetObject,
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
  getTotalCostByRule,
} from "@langfuse/shared/src/server";
import { resolveLangfuseAiFeatureAvailability } from "@/src/features/ai-features/server/availability";
import type {
  CreateOrAttachFromEvaluatorFiltersInput,
  CreateRuleInput,
  CreateTraceTranscriptRuleInput,
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
  /**
   * Only the rule router (behind the evals gate) opts into trace transcript
   * rules; public API and MCP leave it off and never reach them.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: (event: RuleAuditEvent) => Promise<void>,
    private readonly visibility: repository.RuleVisibility = {},
  ) {}

  async list(input: ListRulesInput) {
    const { rules, totalItems } = await repository.listRules({
      prisma: this.prisma,
      input,
      visibility: this.visibility,
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
      visibility: this.visibility,
    });
  }

  async get(projectId: string, ruleId: string) {
    const rule = await repository.findRule({
      prisma: this.prisma,
      projectId,
      ruleId,
      visibility: this.visibility,
    });
    if (!rule) throw new LangfuseNotFoundError("Evaluation rule not found");
    return toRuleResponse(rule);
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

  /** Every experiment rule whose filter includes the dataset, whatever its other conditions. */
  async listRulesForExperimentDataset(projectId: string, datasetId: string) {
    const rules = await repository.listRulesForExperimentDataset({
      prisma: this.prisma,
      projectId,
      datasetId,
    });
    return rules.map(toRuleResponse);
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
      visibility: this.visibility,
    });
  }

  countRulesForEvaluators(projectId: string, evaluatorIds: string[]) {
    return repository.countRulesForEvaluators({
      prisma: this.prisma,
      projectId,
      evaluatorIds,
      visibility: this.visibility,
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
        targetObject: normalized.targetObject,
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

  /** The only writer of trace transcript rules; reached only via the gated router. */
  async createTraceTranscriptRule(
    input: CreateTraceTranscriptRuleInput,
    createdByUserId: string | null,
  ) {
    const filter = this.validateRuleFilters(TopicsTargetObject, input.filter);
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
      await this.assertTraceTranscriptAssignments({
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
      // trace_transcript is immutable: an update may not move a rule into or out of it.
      const intendedTarget = input.targetObject ?? current.targetObject;
      if (
        (intendedTarget === TopicsTargetObject) !==
        (current.targetObject === TopicsTargetObject)
      ) {
        throw new InvalidRequestError(
          "A trace transcript rule's target cannot be changed.",
        );
      }
      const isTraceTranscript = current.targetObject === TopicsTargetObject;
      const { targetObject, filter } = this.resolveRuleUpdateTarget(
        current,
        input,
      );
      await assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: input.projectId,
        additionalActiveRules:
          input.enabled === true && current.status !== JobConfigState.ACTIVE
            ? 1
            : 0,
      });
      const assignments = input.evaluatorMappings
        ? await this.prepareRuleUpdateAssignments({
            prisma,
            projectId: input.projectId,
            targetObject,
            evaluatorMappings: input.evaluatorMappings,
          })
        : undefined;
      await repository.updateRule({
        prisma,
        input,
        targetObject,
        filter: filter as Prisma.InputJsonValue,
        visibility: this.visibility,
      });
      if (assignments) {
        await repository.replaceAssignments({
          prisma,
          projectId: input.projectId,
          ruleId: input.ruleId,
          assignments,
          visibility: this.visibility,
        });
      }
      const updated = isTraceTranscript
        ? await repository.findWrittenRule({
            prisma,
            projectId: input.projectId,
            ruleId: input.ruleId,
          })
        : await repository.findRule({
            prisma,
            projectId: input.projectId,
            ruleId: input.ruleId,
            visibility: this.visibility,
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

  /** Derives the update's target and filter; trace_transcript keeps its stored target. */
  private resolveRuleUpdateTarget(
    current: { targetObject: string; filter: Prisma.JsonValue },
    input: RuleServiceUpdateInput,
  ): {
    targetObject: EvalTargetObject | typeof TopicsTargetObject;
    filter: FilterState;
  } {
    const currentTargetObject = current.targetObject as EvalTargetObject;
    const currentFilter = current.filter as FilterState;
    const effectiveFilter = (input.filter ?? currentFilter) as FilterState;

    if (current.targetObject === TopicsTargetObject) {
      return {
        targetObject: TopicsTargetObject,
        filter: this.validateRuleFilters(TopicsTargetObject, effectiveFilter),
      };
    }

    // Legacy trace/dataset rules are read-only apart from deactivation.
    if (isLegacyEvalTarget(currentTargetObject)) {
      return { targetObject: currentTargetObject, filter: currentFilter };
    }

    // Experiment targeting is derived from the filter, so an update that omits a
    // filter inherits the stored classification instead of silently clearing it.
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
    return {
      targetObject: normalized.targetObject,
      filter: this.validateRuleFilters(
        normalized.targetObject,
        normalized.filter,
      ),
    };
  }

  /** Validates update assignments, branching on the immutable stored target. */
  private async prepareRuleUpdateAssignments(params: {
    prisma: Prisma.TransactionClient;
    projectId: string;
    targetObject: string;
    evaluatorMappings: RuleAssignmentInput[];
  }): Promise<RuleAssignmentInput[]> {
    this.assertLegacyRuleAssignmentsWritable(params.targetObject);
    if (params.targetObject === TopicsTargetObject) {
      await this.assertTraceTranscriptAssignments({
        prisma: params.prisma,
        projectId: params.projectId,
        assignments: params.evaluatorMappings,
      });
      return params.evaluatorMappings;
    }
    return this.prepareModernAssignments({
      prisma: params.prisma,
      projectId: params.projectId,
      targetObject: params.targetObject,
      assignments: params.evaluatorMappings,
    });
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
        visibility: this.visibility,
      });
      const updated = await repository.findRule({
        prisma,
        projectId: params.projectId,
        ruleId: params.ruleId,
        visibility: this.visibility,
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
      repository.deleteRule({
        prisma,
        projectId,
        ruleId,
        visibility: this.visibility,
      }),
    );
    if (!deleted) throw new LangfuseNotFoundError("Evaluation rule not found");
    await invalidateProjectEvalConfigCaches(projectId);
    await this.audit({ action: "delete", projectId, ruleId });
  }

  async deleteMany(input: RuleSelectionInput) {
    const ruleIds = await this.prisma.$transaction(async (prisma) => {
      const ids = await repository.listSelectedRuleIds({
        prisma,
        input,
        visibility: this.visibility,
      });
      await repository.deleteRules({
        prisma,
        projectId: input.projectId,
        ruleIds: ids,
        visibility: this.visibility,
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
        visibility: this.visibility,
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
      const [assignment] =
        rule.targetObject === TopicsTargetObject
          ? await this.assertTraceTranscriptAssignments({
              prisma,
              projectId: params.projectId,
              assignments: [
                {
                  evaluatorId: params.assignment.evaluatorId,
                  variableMapping: params.assignment.variableMapping ?? [],
                },
              ],
            })
          : await this.prepareModernAssignments({
              prisma,
              projectId: params.projectId,
              targetObject: rule.targetObject,
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
          visibility: this.visibility,
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
      return repository.detachEvaluator({
        prisma,
        ...params,
        visibility: this.visibility,
      });
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

  private validateRuleFilters(
    targetObject: EvalTargetObject | typeof TopicsTargetObject,
    filter: unknown,
  ) {
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
    const rule = await repository.findRule({
      prisma,
      projectId,
      ruleId,
      visibility: this.visibility,
    });
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

  private async assertTraceTranscriptAssignments(params: {
    prisma: Prisma.TransactionClient;
    projectId: string;
    assignments: CreateTraceTranscriptRuleInput["evaluatorAssignments"];
  }) {
    const evaluators = await evaluatorRepository.findEvaluatorsByIds({
      prisma: params.prisma,
      projectId: params.projectId,
      evaluatorIds: params.assignments.map(({ evaluatorId }) => evaluatorId),
    });
    if (evaluators.length !== params.assignments.length) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
    const evaluatorById = new Map(
      evaluators.map((evaluator) => [evaluator.id, evaluator]),
    );
    for (const assignment of params.assignments) {
      const evaluator = evaluatorById.get(assignment.evaluatorId)!;
      if (!isTraceTranscriptEvalType(evaluator.type)) {
        throw new InvalidRequestError(
          "Trace evaluations support LLM-as-a-judge and decision-model evaluators.",
        );
      }
      const latestVersion = evaluator.versions[0];
      if (!latestVersion) {
        throw new LangfuseNotFoundError("Evaluator version not found");
      }
      // A null mapping normalizes to empty so validation rejects it, not crashes.
      const variableMapping = assignment.variableMapping ?? [];
      const extracted = extractTranscriptEvalVariables(null, variableMapping);
      if (!extracted.ok) throw new InvalidRequestError(extracted.error);
      assertCompleteEvaluatorVariableMapping({
        promptVariables: requiredEvaluatorVariables(
          evaluator.type,
          latestVersion,
        ),
        variableMapping,
      });
    }
    return params.assignments;
  }

  private async prepareModernAssignments(params: {
    prisma: Prisma.TransactionClient;
    projectId: string;
    targetObject: string;
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
      assertCompleteEvaluatorVariableMapping({
        promptVariables: requiredEvaluatorVariables(
          evaluator.type,
          latestVersion,
        ),
        variableMapping:
          storedVariableMapping ?? prepared.defaultVariableMapping,
        targetObject: params.targetObject,
      });
      return {
        ...assignment,
        variableMapping: storedVariableMapping,
      };
    });
  }
}

type StoredRule = NonNullable<Awaited<ReturnType<typeof repository.findRule>>>;

type EvaluatorWithVersions = Awaited<
  ReturnType<typeof evaluatorRepository.findEvaluatorsByIds>
>[number];

function requiredEvaluatorVariables(
  type: EvalTemplateType,
  latestVersion: EvaluatorWithVersions["versions"][number],
) {
  return type === EvalTemplateType.DECISION_MODEL
    ? latestVersion.vars
    : extractEvaluatorPromptVariables(
        reconcileEvaluatorPromptMessages({
          prompt: latestVersion.prompt,
          promptMessages: latestVersion.promptMessages,
        }),
      );
}

function toRuleResponse(rule: StoredRule) {
  const { status, assignments, filter, sampling, ...rest } = rule;
  // trace_transcript must skip normalization: isExperimentItemRootSpan is a valid
  // trace filter column that would otherwise mislabel the rule as EVENT.
  const normalized =
    rest.targetObject === TopicsTargetObject
      ? { targetObject: TopicsTargetObject, filter: filter as FilterState }
      : normalizeEvaluationRuleTarget({
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
