import type { FilterState, Observation } from "@langfuse/shared";
import { InMemoryFilterService } from "@langfuse/shared/src/server";
import type { TopicRule } from "@langfuse/shared/topics";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";

type MatchableRule = Pick<TopicRule, "id" | "filter" | "sampling" | "enabled">;

function traceName(observations: Observation[]) {
  return (
    observations.find((row) => !row.parentObservationId)?.name ??
    observations[0]?.name ??
    null
  );
}

function fieldValue(
  observation: Observation,
  column: string,
  name: string | null,
) {
  switch (column) {
    case "environment":
      return observation.environment;
    case "traceName":
      return name;
    case "name":
      return observation.name;
    case "type":
      return observation.type;
    case "level":
      return observation.level;
    case "metadata":
      return observation.metadata;
    default:
      return undefined;
  }
}

/**
 * Rules a finished trace belongs to. A trace matches a rule when one of its
 * observations meets every filter and the trace falls into the rule's
 * deterministic sample; disabled rules never match. Filter columns are limited
 * to TOPICS_RULE_FILTER_COLUMNS when a rule is saved.
 */
export function matchTopicRules(
  traceId: string,
  observations: Observation[],
  rules: MatchableRule[],
): string[] {
  const name = traceName(observations);
  const samplingValue = getDeterministicSamplingValue(traceId);
  return rules
    .filter(
      (rule) =>
        rule.enabled !== false &&
        shouldSampleEvaluation({
          samplingValue,
          samplingRate: rule.sampling,
        }) &&
        (rule.filter.length === 0 ||
          observations.some((observation) =>
            InMemoryFilterService.evaluateFilter(
              observation,
              rule.filter as FilterState,
              (row, column) => fieldValue(row, column, name),
            ),
          )),
    )
    .map((rule) => rule.id);
}
