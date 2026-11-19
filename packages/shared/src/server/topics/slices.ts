import { prisma } from "../../db";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicAnalysisConfig,
  type TopicTimeRange,
} from "../../topics";
import type { TopicClusteringCohort, TopicCohortTraces } from "./clickhouse";
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
}): Promise<TopicClusteringCohort & { traces: TopicCohortTraces }> {
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
