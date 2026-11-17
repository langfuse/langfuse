import {
  coerceLegacyEmptyMetadataFilters,
  EvalTemplateType,
  mapEventEvalFilterColumnIdToField,
  TopicsTargetObject,
  traceTranscriptFilterDefinition,
  validateEvaluatorFiltersForTarget,
  type FilterState,
  type ObservationForEval,
} from "@langfuse/shared";
import {
  InMemoryFilterService,
  logger,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { isTopicsProcessingActive } from "@langfuse/shared/topics/server";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";
import type { TraceTranscriptEvalRule } from "../evaluation/observationEval/types";

type TraceBatchRule = {
  id: string;
  projectId: string;
  filter: FilterState;
  sampling: number;
};

/** Validate persisted predicates once per batch, before matching observations. */
export async function prepareTraceBatchRules(
  projectId: string,
  rules: TraceTranscriptEvalRule[],
): Promise<TraceBatchRule[]> {
  const needsTopics = (rule: TraceTranscriptEvalRule) =>
    rule.assignments.every(
      (assignment) => assignment.evaluator.type === EvalTemplateType.FACET,
    );
  const topicsActive = rules.some(needsTopics)
    ? await isTopicsProcessingActive(projectId).catch((error) => {
        logger.warn("Failed to check Topics availability for trace rules", {
          projectId,
          error,
        });
        return false;
      })
    : false;

  return rules.flatMap((rule) => {
    if (rule.projectId !== projectId || (needsTopics(rule) && !topicsActive)) {
      return [];
    }
    const validation = validateEvaluatorFiltersForTarget({
      targetObject: TopicsTargetObject,
      filter: coerceLegacyEmptyMetadataFilters(rule.filter),
    });
    if (!validation.isValid) {
      logger.warn("Skipping trace rule with unsupported filters", {
        projectId,
        ruleId: rule.id,
        issues: validation.issues,
      });
      return [];
    }

    return [
      {
        id: rule.id,
        projectId,
        sampling: Number(rule.sampling),
        filter: validation.validatedFilters.map((filter) => {
          const column = traceTranscriptFilterDefinition.columns.find(
            (column) =>
              column.id === filter.column ||
              column.name === filter.column ||
              column.aliases?.includes(filter.column),
          )!;
          // SQL-compatible string options on tags mean array membership in memory.
          return filter.type === "stringOptions" &&
            column.type === "arrayOptions"
            ? { ...filter, column: column.id, type: "arrayOptions" as const }
            : { ...filter, column: column.id };
        }),
      },
    ];
  });
}

/** All predicates must match one observation; selection applies to its trace. */
export function getMatchingTraceBatchRuleIds(
  observation: ObservationForEval,
  rules: TraceBatchRule[],
): string[] {
  const startedAt = performance.now();
  let outcome = "error";
  try {
    const samplingValue = getDeterministicSamplingValue(observation.trace_id);
    const ruleIds = rules
      .filter(
        (rule) =>
          rule.projectId === observation.project_id &&
          InMemoryFilterService.evaluateFilter(
            observation,
            rule.filter,
            mapEventEvalFilterColumnIdToField,
          ) &&
          shouldSampleEvaluation({
            samplingValue,
            samplingRate: rule.sampling,
          }),
      )
      .map((rule) => rule.id);
    outcome = ruleIds.length > 0 ? "selected" : "not_selected";
    return ruleIds;
  } finally {
    recordIncrement("langfuse.trace_dispatch.filter_outcomes", 1, { outcome });
    recordDistribution(
      "langfuse.trace_dispatch.filter_duration_ms",
      performance.now() - startedAt,
      { outcome, unit: "milliseconds" },
    );
  }
}
