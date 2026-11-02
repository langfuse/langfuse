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
  EvaluationRuleWithAssignments,
  ObservationEvalRule,
  TraceTranscriptEvalRule,
} from "./types";

const runnableObservationEvaluatorTypes: EvalTemplateType[] = [
  EvalTemplateType.LLM_AS_JUDGE,
  EvalTemplateType.CODE,
  EvalTemplateType.DECISION_MODEL,
];
const runnableTraceEvaluatorTypes = runnableObservationEvaluatorTypes.concat(
  EvalTemplateType.FACET,
);

/** Fetch only observation rules for callers that schedule individual spans. */
export async function fetchObservationEvalRules(
  projectId: string,
): Promise<ObservationEvalRule[]> {
  const rules = await fetchRules(projectId, "eventBased");
  return rules.map(normalizeObservationRule);
}

/** Fetch both ingestion targets once, keeping transcript rules out of span scheduling. */
export async function fetchIngestionEvalRules(projectId: string): Promise<{
  observationRules: ObservationEvalRule[];
  traceRules: TraceTranscriptEvalRule[];
}> {
  const rules = await fetchRules(projectId, "traceTranscriptBased");
  const observationRules: ObservationEvalRule[] = [];
  const traceRules: TraceTranscriptEvalRule[] = [];
  for (const rule of rules) {
    if (rule.targetObject === TopicsTargetObject) {
      traceRules.push({
        ...rule,
        ruleId: rule.id,
        targetObject: TopicsTargetObject,
        filter: coerceLegacyEmptyMetadataFilters(rule.filter) as FilterState,
      });
    } else {
      observationRules.push(normalizeObservationRule(rule));
    }
  }
  return { observationRules, traceRules };
}

async function fetchRules(
  projectId: string,
  scope: "eventBased" | "traceTranscriptBased",
) {
  // Observation-only cache entries say nothing about transcript rules.
  if (await hasNoEvalConfigsCache(projectId, scope)) return [];

  const observationAssignments = {
    projectId,
    evaluator: {
      projectId,
      blockedAt: null,
      type: { in: runnableObservationEvaluatorTypes },
    },
  };
  const traceAssignments = {
    projectId,
    evaluator: {
      projectId,
      blockedAt: null,
      type: { in: runnableTraceEvaluatorTypes },
    },
  };
  const observationTargets = {
    targetObject: {
      in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
    },
    assignments: { some: observationAssignments },
  };
  const rules = await prisma.evaluationRule.findMany({
    where: {
      projectId,
      status: JobConfigState.ACTIVE,
      // Rules without runnable assignments must not defeat negative caching.
      ...(scope === "traceTranscriptBased"
        ? {
            OR: [
              observationTargets,
              {
                targetObject: TopicsTargetObject,
                assignments: { some: traceAssignments },
              },
            ],
          }
        : observationTargets),
    },
    select: {
      id: true,
      projectId: true,
      filter: true,
      sampling: true,
      status: true,
      targetObject: true,
      assignments: {
        where:
          scope === "traceTranscriptBased"
            ? traceAssignments
            : observationAssignments,
        select: {
          id: true,
          evaluatorId: true,
          variableMapping: true,
          evaluator: {
            select: {
              id: true,
              projectId: true,
              type: true,
            },
          },
        },
      },
    },
  });

  if (rules.length === 0) {
    await setNoEvalConfigsCache(projectId, scope);
  }
  logger.debug(
    `Found ${rules.length} ${scope} eval rules for project ${projectId}`,
  );
  return rules;
}

function normalizeObservationRule(
  rule: Awaited<ReturnType<typeof fetchRules>>[number],
): EvaluationRuleWithAssignments {
  // The experiment target is represented by its root-span filter at scheduling.
  const normalized = normalizeEvaluationRuleTarget({
    targetObject: rule.targetObject as
      | typeof EvalTargetObject.EVENT
      | typeof EvalTargetObject.EXPERIMENT,
    filter: coerceLegacyEmptyMetadataFilters(rule.filter) as FilterState,
  });
  return {
    ...rule,
    ...normalized,
    ruleId: rule.id,
    // Combined fetches also select facets, which cannot run on individual spans.
    assignments: rule.assignments.filter((assignment) =>
      runnableObservationEvaluatorTypes.includes(assignment.evaluator.type),
    ),
  };
}
