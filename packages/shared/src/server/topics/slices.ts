import { prisma } from "../../db";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicAnalysisConfig,
  type TopicTimeRange,
} from "../../topics";
import { getTopicRule, listTopicRules } from "./postgres";
import { selectTopicTraceRows } from "./trace-selection";

/**
 * The traces one clustering run may use. A rule's cohort is resolved at fit
 * time: its filter runs as a trace query over the fit window and is joined with
 * current summaries by the caller; sampling is not re-applied. An analysis
 * clusters a random sample of at most TOPICS_SLICE_MAX_TRACES matching traces.
 * Without a rule or analysis, the update refits the project's oldest rule.
 * `cohortTraceIds` is undefined when every summary in the window qualifies.
 */
export async function resolveTopicClusteringCohort(input: {
  projectId: string;
  timeRange: TopicTimeRange;
  ruleId?: string | null;
  analysis?: TopicAnalysisConfig;
  maxRows: number;
}): Promise<{ ruleId: string | null; cohortTraceIds?: string[] }> {
  const window = { from: input.timeRange.from, to: input.timeRange.to };
  if (input.analysis) {
    const rows = await selectTopicTraceRows(
      {
        projectId: input.projectId,
        filter: input.analysis.filter,
        ...window,
        limit: TOPICS_SLICE_MAX_TRACES,
        sampling: "random",
        seed: input.analysis.seed,
        anyObservation: true,
      },
      prisma,
      "ids",
    );
    return { ruleId: null, cohortTraceIds: rows.map((row) => row.id) };
  }
  const rule = input.ruleId
    ? await getTopicRule(input.projectId, input.ruleId)
    : (await listTopicRules(input.projectId))[0];
  if (!rule) return { ruleId: null };
  if (!rule.filter.length) return { ruleId: rule.id };
  const rows = await selectTopicTraceRows(
    {
      projectId: input.projectId,
      filter: rule.filter,
      ...window,
      limit: input.maxRows + 1,
      sampling: "latest",
      seed: rule.id,
      anyObservation: true,
    },
    prisma,
    "ids",
  );
  return { ruleId: rule.id, cohortTraceIds: rows.map((row) => row.id) };
}
