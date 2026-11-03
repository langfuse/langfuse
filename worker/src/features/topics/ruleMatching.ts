import type { FilterState, Observation } from "@langfuse/shared";
import { InMemoryFilterService } from "@langfuse/shared/src/server";
import {
  TOPICS_RULE_FILTER_COLUMNS,
  type TopicRule,
} from "@langfuse/shared/topics";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";

type MatchableRule = Pick<TopicRule, "id" | "filter" | "sampling" | "enabled">;
type MatchableObservation = Observation & { sessionId?: string | null };

const matcherColumns = new Set<string>(TOPICS_RULE_FILTER_COLUMNS);

function traceName(observations: MatchableObservation[]) {
  return (
    observations.find((row) => !row.parentObservationId)?.name ??
    observations[0]?.name ??
    null
  );
}

function fieldValue(
  observation: MatchableObservation,
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
    case "statusMessage":
      return observation.statusMessage;
    case "sessionId":
      return observation.sessionId ?? null;
    case "parentObservationId":
      return observation.parentObservationId;
    case "calledToolNames":
      return observation.toolCallNames ?? [];
    case "toolCalls":
      return observation.toolCalls?.length ?? 0;
    default:
      return undefined;
  }
}

/**
 * Rules a finished trace belongs to. A trace matches a rule when one of its
 * observations meets every filter and the trace falls into the rule's
 * deterministic sample; disabled rules never match. New rules only take
 * TOPICS_RULE_FILTER_COLUMNS; conditions a stored rule has on other columns
 * cannot be evaluated here, so they are skipped and reported through
 * `onUnsupportedColumns` rather than dropping the rule's traces.
 */
export function matchTopicRules(
  traceId: string,
  observations: MatchableObservation[],
  rules: MatchableRule[],
  onUnsupportedColumns?: (ruleId: string, columns: string[]) => void,
): string[] {
  const name = traceName(observations);
  const samplingValue = getDeterministicSamplingValue(traceId);
  return rules
    .filter((rule) => {
      if (
        rule.enabled === false ||
        !shouldSampleEvaluation({
          samplingValue,
          samplingRate: rule.sampling,
        })
      )
        return false;
      const filter = (rule.filter as FilterState).filter((item) =>
        matcherColumns.has(item.column),
      );
      if (filter.length < rule.filter.length)
        onUnsupportedColumns?.(rule.id, [
          ...new Set(
            (rule.filter as FilterState)
              .map((item) => item.column)
              .filter((column) => !matcherColumns.has(column)),
          ),
        ]);
      return (
        filter.length === 0 ||
        observations.some((observation) =>
          InMemoryFilterService.evaluateFilter(
            observation,
            filter,
            (row, column) => fieldValue(row, column, name),
          ),
        )
      );
    })
    .map((rule) => rule.id);
}
