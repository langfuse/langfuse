import {
  coerceLegacyEmptyMetadataFilters,
  mapEventEvalFilterColumnIdToField,
  TopicsTargetObject,
  traceTranscriptFilterColumns,
  validateEvaluatorFiltersForTarget,
  type FilterState,
  type ObservationForEval,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { InMemoryFilterService, logger } from "@langfuse/shared/src/server";
import {
  isTopicsProcessingActive,
  topicRuleWhere,
} from "@langfuse/shared/topics/server";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";
import { isObservationAllowedForQueuedObservationEvals } from "../evaluation/observationEval";

export type TraceBatchRule = {
  id: string;
  projectId: string;
  filter: FilterState;
  sampling: number;
};

/** Load once per ingestion batch; only Topics consumes selected traces today. */
export async function fetchTraceBatchRules(
  projectId: string,
): Promise<TraceBatchRule[] | undefined> {
  if (!(await isTopicsProcessingActive(projectId))) return undefined;
  const rules = await prisma.evaluationRule.findMany({
    where: {
      AND: [
        topicRuleWhere(projectId),
        {
          status: "ACTIVE",
          assignments: {
            some: {
              projectId,
              evaluator: { projectId, type: "FACET", blockedAt: null },
            },
          },
        },
      ],
    },
    select: { id: true, projectId: true, filter: true, sampling: true },
  });
  return rules.flatMap((rule) => {
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
        ...rule,
        sampling: Number(rule.sampling),
        filter: validation.validatedFilters.map((filter) => {
          const column = traceTranscriptFilterColumns.find(
            (column) =>
              column.id === filter.column ||
              column.name === filter.column ||
              column.aliases?.includes(filter.column),
          )!;
          // The SQL-compatible string-options spelling of tags still means array membership.
          return filter.type === "stringOptions" &&
            column.type === "arrayOptions"
            ? { ...filter, column: column.id, type: "arrayOptions" as const }
            : { ...filter, column: column.id };
        }),
      },
    ];
  });
}

/** A positive match selects the trace, independently for each rule. */
export function getMatchingTraceBatchRuleIds(
  observation: ObservationForEval,
  rules: TraceBatchRule[],
): string[] {
  if (!isObservationAllowedForQueuedObservationEvals(observation)) return [];
  return rules
    .filter(
      (rule) =>
        rule.projectId === observation.project_id &&
        InMemoryFilterService.evaluateFilter(
          observation,
          rule.filter ?? [],
          mapEventEvalFilterColumnIdToField,
        ) &&
        shouldSampleEvaluation({
          samplingValue: getDeterministicSamplingValue(
            JSON.stringify([
              observation.project_id,
              observation.trace_id,
              rule.id,
            ]),
          ),
          samplingRate: rule.sampling,
        }),
    )
    .map((rule) => rule.id);
}
