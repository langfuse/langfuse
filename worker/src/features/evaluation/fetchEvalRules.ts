import {
  EvalTemplateType,
  EvalTargetObject,
  JobConfigState,
  TopicsTargetObject,
  coerceLegacyEmptyMetadataFilters,
  normalizeEvaluationRuleTarget,
  type FilterState,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
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

/** Fetch active observation and transcript rules for ingestion and experiments. */
export async function fetchEvalRules(projectId: string): Promise<EvalRules> {
  const rules: EvalRules = { observationRules: [], traceTranscriptRules: [] };
  // A cached absence covers both targets, independently of feature enablement.
  const hasNoRules = await hasNoEvalConfigsCache(projectId, "evalRules");
  if (hasNoRules) {
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

  const rows = await prisma.evaluationRule.findMany({
    where: {
      projectId,
      status: JobConfigState.ACTIVE,
      // Only rules with runnable assignments should prevent negative caching.
      OR: [
        {
          targetObject: {
            in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
          },
          assignments: { some: observationAssignments },
        },
        {
          targetObject: TopicsTargetObject,
          assignments: { some: transcriptAssignments },
        },
      ],
    },
    select: {
      id: true,
      projectId: true,
      filter: true,
      sampling: true,
      status: true,
      targetObject: true,
      assignments: {
        where: transcriptAssignments,
        select: {
          id: true,
          evaluatorId: true,
          variableMapping: true,
          evaluator: { select: { id: true, projectId: true, type: true } },
        },
      },
    },
  });

  if (rows.length === 0) {
    logger.debug(`No eval rules found for project ${projectId}, caching`);
    await setNoEvalConfigsCache(projectId, "evalRules");
    return rules;
  }

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

  logger.debug(`Found ${rows.length} eval rules for project ${projectId}`);
  return rules;
}
