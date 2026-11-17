import { createHash, randomUUID } from "node:crypto";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import {
  TOPICS_ANALYSIS_MIN_TRACES,
  TOPICS_ANALYSIS_SAMPLING_SEED,
  TOPICS_ANALYSIS_SMALL_SAMPLE_MIN_TRACES,
  TOPICS_SLICE_MAX_TRACES,
  type TopicSnapshotSummarize,
  type TopicAnalysisConfig,
  type TopicExecutionSummary,
  type TopicFacetRef,
  type TopicRule,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import {
  countTopicCohortTraces,
  createTopicExecution,
  enqueueTopicExecution,
  enqueueTopicSnapshotSetup,
  getTopicRuleRefits,
  getTopicRuleRefreshStatuses,
  getTopicSummaryCounts,
  getTopicsModels,
  listTopicAnalysisExecutions,
  listTopicRules,
  readTopicExecutionSummary,
  topicAnalysisCohort,
} from "@langfuse/shared/topics/server";
import { logger } from "@langfuse/shared/src/server";
import { countUnsummarizedTopicTraces } from "./traceSelection";

type Filter = TopicRule["filter"];
type AnalysisExecution = TopicExecutionSummary & {
  input: Extract<TopicExecutionSummary["input"], { operation: "update" }> & {
    analysis: TopicAnalysisConfig;
  };
};

const isAnalysis = (
  execution: TopicExecutionSummary,
): execution is AnalysisExecution =>
  execution.input.operation === "update" && !!execution.input.analysis;

/** Rules with their last update, and one-off analyses, for the map picker. */
export async function topicMapsOverview(projectId: string) {
  const [rules, refits, executions] = await Promise.all([
    listTopicRules(projectId),
    getTopicRuleRefits(projectId),
    listTopicAnalysisExecutions(projectId),
  ]);
  const refreshes = await getTopicRuleRefreshStatuses(
    projectId,
    rules.map((rule) => rule.id),
  );
  return {
    rules: rules.map((rule, index) => ({
      ...rule,
      lastRefitAt: refits.get(rule.id)?.toISOString() ?? null,
      refresh: refreshes[index],
    })),
    analyses: executions.filter(isAnalysis).map((execution) => ({
      id: execution.id,
      label: execution.input.analysis.label,
      filter: execution.input.analysis.filter,
      facetIds: execution.input.facets.map(({ facetId }) => facetId),
      status: execution.status,
      createdAt: execution.createdAt,
      timeRange: execution.input.timeRange,
      traceCount: Math.max(
        0,
        ...execution.facets.map((facet) => facet.counts.requested),
      ),
    })),
  };
}

export async function requireAnalysis(projectId: string, executionId: string) {
  const execution = await readTopicExecutionSummary(projectId, executionId);
  if (!execution || !isAnalysis(execution))
    throw new LangfuseNotFoundError("Analysis not found.");
  return execution;
}

async function embeddingConfig(projectId: string) {
  const models = await getTopicsModels(projectId);
  if (!models)
    throw new InvalidRequestError(
      "Choose summary, embedding, and clustering models in the Topics model settings first.",
    );
  return {
    embeddingModel: models.embedding.model,
    embeddingDimensions: models.embedding.dimensions,
  };
}

/**
 * How many traces an analysis would cluster, per facet: a seeded sample of the
 * slice's summarized traces, the same one its run clusters. Run needs enough.
 */
export async function previewTopicAnalysis(input: {
  projectId: string;
  filter: Filter;
  timeRange: TopicTimeRange;
  facets: TopicFacetRef[];
}) {
  const [cohort, config] = await Promise.all([
    topicAnalysisCohort({
      projectId: input.projectId,
      filter: input.filter,
      timeRange: input.timeRange,
      seed: TOPICS_ANALYSIS_SAMPLING_SEED,
    }),
    embeddingConfig(input.projectId),
  ]);
  const [matchedTraceCount, counts, unsummarizedCount] = await Promise.all([
    countTopicCohortTraces(input.projectId, cohort.traces),
    getTopicSummaryCounts(
      input.projectId,
      input.facets,
      config,
      input.timeRange,
      cohort,
    ),
    // An estimate for the summarize option; a slow scan must not block the snapshot.
    countUnsummarizedTopicTraces({ ...input, embeddingConfig: config }).catch(
      (error: unknown) => {
        logger.warn("Topics snapshot could not count unsummarized traces", {
          projectId: input.projectId,
          error,
        });
        return null;
      },
    ),
  ]);
  const summarizedCount = Math.min(...counts.map(({ count }) => count));
  return {
    matchedTraceCount,
    unsummarizedCount,
    capped: summarizedCount >= TOPICS_SLICE_MAX_TRACES,
    summarized: counts,
    summarizedCount,
    minimumTraceCount: TOPICS_ANALYSIS_MIN_TRACES,
    smallSampleMinimumTraceCount: TOPICS_ANALYSIS_SMALL_SAMPLE_MIN_TRACES,
    ready: summarizedCount >= TOPICS_ANALYSIS_MIN_TRACES,
  };
}

/**
 * Starts a snapshot: a one-off clustering run over a summarized slice. With
 * `summarize`, its controller first summarizes up to that many more traces.
 */
export async function startTopicAnalysis(
  input: {
    projectId: string;
    label: string;
    filter: Filter;
    timeRange: TopicTimeRange;
    facets: TopicFacetRef[];
    summarize?: TopicSnapshotSummarize;
  },
  userId: string,
) {
  const preview = await previewTopicAnalysis(input);
  // Without a count, the selection itself bounds what gets summarized.
  const extra = input.summarize
    ? Math.min(
        input.summarize.limit,
        preview.unsummarizedCount ?? input.summarize.limit,
      )
    : 0;
  const grouped = preview.summarizedCount + extra;
  if (grouped < TOPICS_ANALYSIS_SMALL_SAMPLE_MIN_TRACES)
    throw new InvalidRequestError(
      `A snapshot needs at least ${TOPICS_ANALYSIS_SMALL_SAMPLE_MIN_TRACES} summarized traces in this slice.`,
    );
  const summarize = extra > 0 ? input.summarize : undefined;
  const requestId = randomUUID();
  const execution = await createTopicExecution(
    {
      operation: "update",
      projectId: input.projectId,
      requestId,
      facets: input.facets,
      embeddingConfig: await embeddingConfig(input.projectId),
      timeRange: input.timeRange,
      // The fit picks small-sample clustering from the summaries it loads.
      exploratory: false,
      analysis: {
        label: input.label,
        filter: input.filter,
        seed: TOPICS_ANALYSIS_SAMPLING_SEED,
        ...(summarize ? { summarize } : {}),
      },
    },
    createHash("sha256").update(requestId).digest("hex"),
    userId,
  );
  if (execution.status === "queued")
    await (summarize
      ? enqueueTopicSnapshotSetup(input.projectId, execution.id)
      : enqueueTopicExecution(input.projectId, execution.id));
  return { id: execution.id };
}
