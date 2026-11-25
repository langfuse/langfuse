import {
  EvalTemplateType,
  EvalTargetObject,
  JobConfigState,
  TopicsTargetObject,
  coerceLegacyEmptyMetadataFilters,
  normalizeEvaluationRuleTarget,
  type FilterState,
} from "@langfuse/shared";
import { prisma, type Prisma } from "@langfuse/shared/src/db";
import {
  logger,
  hasNoEvalConfigsCache,
  setNoEvalConfigsCache,
} from "@langfuse/shared/src/server";
import type {
  ObservationEvalRule,
  TraceTranscriptEvalRule,
} from "./observationEval/types";

export type EvalRules = {
  observationRules: ObservationEvalRule[];
  traceTranscriptRules: TraceTranscriptEvalRule[];
};

const observationEvaluatorTypes: EvalTemplateType[] = [
  EvalTemplateType.LLM_AS_JUDGE,
  EvalTemplateType.CODE,
  EvalTemplateType.DECISION_MODEL,
];

/** Fetch active observation rules, including transcript rules when requested. */
export async function fetchEvalRules(
  projectId: string,
  {
    includeTraceTranscriptRules = false,
  }: { includeTraceTranscriptRules?: boolean } = {},
): Promise<EvalRules> {
  const rules: EvalRules = { observationRules: [], traceTranscriptRules: [] };
  // Keep the observation cache key so older deployments still invalidate it.
  // Transcript absence is cached separately and cannot suppress observation evals.
  const [hasNoObservationRules, hasNoTranscriptRules] = await Promise.all([
    hasNoEvalConfigsCache(projectId, "eventBased"),
    includeTraceTranscriptRules
      ? hasNoEvalConfigsCache(projectId, "traceTranscriptBased")
      : false,
  ]);
  const shouldFetchTranscriptRules =
    includeTraceTranscriptRules && !hasNoTranscriptRules;
  if (hasNoObservationRules && !shouldFetchTranscriptRules) {
    logger.debug(
      `Skipping eval rule fetch - no rules cached for project ${projectId}`,
    );
    return rules;
  }

  const observationAssignments = {
    projectId,
    evaluator: {
      projectId,
      blockedAt: null,
      type: { in: observationEvaluatorTypes },
    },
  };
  const transcriptAssignments = {
    ...observationAssignments,
    evaluator: {
      ...observationAssignments.evaluator,
      type: { in: [...observationEvaluatorTypes, EvalTemplateType.FACET] },
    },
  };

  const targets: Prisma.EvaluationRuleWhereInput[] = [];
  if (!hasNoObservationRules) {
    targets.push({
      targetObject: {
        in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
      },
      assignments: { some: observationAssignments },
    });
  }
  if (shouldFetchTranscriptRules) {
    targets.push({
      targetObject: TopicsTargetObject,
      assignments: { some: transcriptAssignments },
    });
  }

  const rows = await prisma.evaluationRule.findMany({
    where: {
      projectId,
      status: JobConfigState.ACTIVE,
      // Only rules with runnable assignments should prevent negative caching.
      OR: targets,
    },
    select: {
      id: true,
      projectId: true,
      filter: true,
      sampling: true,
      status: true,
      targetObject: true,
      assignments: {
        where: shouldFetchTranscriptRules
          ? transcriptAssignments
          : observationAssignments,
        select: {
          id: true,
          evaluatorId: true,
          variableMapping: true,
          evaluator: { select: { id: true, projectId: true, type: true } },
        },
      },
    },
  });

  for (const rule of rows) {
    const filter = coerceLegacyEmptyMetadataFilters(rule.filter) as FilterState;
    if (rule.targetObject === TopicsTargetObject) {
      rules.traceTranscriptRules.push({
        ...rule,
        ruleId: rule.id,
        targetObject: TopicsTargetObject,
        filter,
      });
    } else {
      rules.observationRules.push({
        ...rule,
        ruleId: rule.id,
        // Experiment rules schedule their root observation through the same filter path.
        ...normalizeEvaluationRuleTarget({
          targetObject: rule.targetObject as
            | typeof EvalTargetObject.EVENT
            | typeof EvalTargetObject.EXPERIMENT,
          filter,
        }),
        assignments: rule.assignments.filter((assignment) =>
          observationEvaluatorTypes.includes(assignment.evaluator.type),
        ),
      });
    }
  }

  if (!hasNoObservationRules && rules.observationRules.length === 0) {
    logger.debug(
      `No observation eval rules found for project ${projectId}, caching`,
    );
    await setNoEvalConfigsCache(projectId, "eventBased");
  }
  if (shouldFetchTranscriptRules && rules.traceTranscriptRules.length === 0) {
    logger.debug(
      `No transcript eval rules found for project ${projectId}, caching`,
    );
    await setNoEvalConfigsCache(projectId, "traceTranscriptBased");
  }

  logger.debug(`Found ${rows.length} eval rules for project ${projectId}`);
  return rules;
}
