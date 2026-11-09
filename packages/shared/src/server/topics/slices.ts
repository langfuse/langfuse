import { prisma } from "../../db";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicAnalysisConfig,
  type TopicTimeRange,
} from "../../topics";
import type { TopicClusteringCohort, TopicCohortTraces } from "./clickhouse";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { listTopicRules } from "./postgres";
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

/**
 * The traces one clustering run may use. A rule's cohort is every summarized
 * trace in the fit window that ingestion matching would assign it: its filter
 * and, with several rules sharing summaries, its deterministic sample. A cohort beyond the worker's capacity fails the fit
 * rather than being truncated. Without a rule or analysis, the update refits
 * the project's oldest rule. `cohort` is undefined when every summary qualifies.
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
  const rules = await listTopicRules(input.projectId);
  const rule = input.ruleId
    ? rules.find((item) => item.id === input.ruleId)
    : rules[0];
  if (!rule) {
    if (input.ruleId)
      throw new InvalidRequestError("Topic rule not found in this project.");
    return { ruleId: null };
  }
  const filter = rule.filter;
  const samplingRate =
    rules.length > 1 && rule.sampling < 1 ? rule.sampling : undefined;
  if (!filter.length && samplingRate === undefined) return { ruleId: rule.id };
  return {
    ruleId: rule.id,
    cohort: {
      ...(filter.length
        ? {
            traces: await selectTopicCohortTraces(
              {
                projectId: input.projectId,
                filter,
                from: input.timeRange.from,
                to: input.timeRange.to,
              },
              prisma,
            ),
          }
        : {}),
      samplingRate,
    },
  };
}
