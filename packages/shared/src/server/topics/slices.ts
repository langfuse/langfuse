import { prisma } from "../../db";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicAnalysisConfig,
  type TopicTimeRange,
} from "../../topics";
import type { TopicClusteringCohort } from "./clickhouse";
import { getTopicRule, listTopicRules } from "./postgres";
import { selectTopicCohortTraces } from "./trace-selection";

/**
 * An analysis's cohort: a seeded random sample of at most
 * TOPICS_SLICE_MAX_TRACES summarized traces that match its filter. Preview and
 * run take the same sample for the same window.
 */
export async function topicAnalysisCohort(input: {
  projectId: string;
  filter: TopicAnalysisConfig["filter"];
  timeRange: TopicTimeRange;
  seed: string;
}): Promise<TopicClusteringCohort> {
  return {
    traces: await selectTopicCohortTraces(
      {
        projectId: input.projectId,
        filter: input.filter,
        from: input.timeRange.from,
        to: input.timeRange.to,
      },
      prisma,
    ),
    sample: { seed: input.seed, limit: TOPICS_SLICE_MAX_TRACES },
  };
}

/**
 * The traces one clustering run may use. A rule's cohort is every summarized
 * trace in the fit window that matches its filter; sampling is not re-applied
 * and a cohort beyond the worker's capacity fails the fit rather than being
 * truncated. Without a rule or analysis, the update refits the project's oldest
 * rule. `cohort` is undefined when every summary in the window qualifies.
 */
export async function resolveTopicClusteringCohort(input: {
  projectId: string;
  timeRange: TopicTimeRange;
  ruleId?: string | null;
  analysis?: TopicAnalysisConfig;
}): Promise<{ ruleId: string | null; cohort?: TopicClusteringCohort }> {
  if (input.analysis)
    return {
      ruleId: null,
      cohort: await topicAnalysisCohort({
        projectId: input.projectId,
        filter: input.analysis.filter,
        timeRange: input.timeRange,
        seed: input.analysis.seed,
      }),
    };
  const rule = input.ruleId
    ? await getTopicRule(input.projectId, input.ruleId)
    : (await listTopicRules(input.projectId))[0];
  if (!rule) return { ruleId: null };
  if (!rule.filter.length) return { ruleId: rule.id };
  return {
    ruleId: rule.id,
    cohort: {
      traces: await selectTopicCohortTraces(
        {
          projectId: input.projectId,
          filter: rule.filter,
          from: input.timeRange.from,
          to: input.timeRange.to,
        },
        prisma,
      ),
    },
  };
}
