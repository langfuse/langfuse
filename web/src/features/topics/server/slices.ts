import { createHash, randomUUID } from "node:crypto";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import {
  TOPICS_ANALYSIS_MIN_TRACES,
  TOPICS_ANALYSIS_SAMPLING_SEED,
  TOPICS_SLICE_MAX_TRACES,
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
  getLatestFacetSummaries,
  getTopicRuleRefits,
  getTopicRun,
  getTopicSummaryCounts,
  getTopicsModels,
  listTopicAnalysisExecutions,
  listTopicFacets,
  listTopicRules,
  readTopicExecutionSummary,
  readTopicMapAssignments,
  topicAnalysisCohort,
} from "@langfuse/shared/topics/server";
import { facetTopicResult } from "./currentResults";

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
  return {
    rules: rules.map((rule) => ({
      ...rule,
      lastRefitAt: refits.get(rule.id)?.toISOString() ?? null,
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

async function requireAnalysis(projectId: string, executionId: string) {
  const execution = await readTopicExecutionSummary(projectId, executionId);
  if (!execution || !isAnalysis(execution))
    throw new LangfuseNotFoundError("Analysis not found.");
  return execution;
}

/** One analysis run's maps: its own snapshot, never current topics. */
export async function analysisTopicResults(
  projectId: string,
  executionId: string,
) {
  const execution = await requireAnalysis(projectId, executionId);
  const { timeRange } = execution.input;
  const facets = await listTopicFacets(projectId);
  const results = await Promise.all(
    execution.facets.map(async (progress) => {
      const facet = facets.find((item) => item.id === progress.facetId);
      if (!facet) return null;
      const run = progress.runId
        ? await getTopicRun(projectId, progress.runId)
        : null;
      if (!run || run.status !== "completed")
        return {
          ...(await facetTopicResult({
            projectId,
            facet,
            storedAssignments: [],
            storedSummaries: [],
            run: null,
            membership: "snapshot",
          })),
          outcome: progress.outcome,
        };
      const storedAssignments = await readTopicMapAssignments(
        projectId,
        { facetId: facet.id, version: run.facetVersion },
        run.id,
        timeRange,
      );
      const storedSummaries = storedAssignments.length
        ? await getLatestFacetSummaries(
            projectId,
            facet.id,
            run.facetVersion,
            timeRange,
            storedAssignments.flatMap((row) =>
              row.traceId ? [row.traceId] : [],
            ),
          )
        : [];
      return {
        ...(await facetTopicResult({
          projectId,
          facet,
          storedAssignments,
          storedSummaries,
          run,
          membership: "snapshot",
        })),
        outcome: progress.outcome,
      };
    }),
  );
  return {
    execution: {
      id: execution.id,
      status: execution.status,
      createdAt: execution.createdAt,
      timeRange,
      ...execution.input.analysis,
    },
    facets: results.flatMap((facet) => (facet ? [facet] : [])),
  };
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
  const [matchedTraceCount, counts] = await Promise.all([
    countTopicCohortTraces(input.projectId, cohort.traces),
    getTopicSummaryCounts(
      input.projectId,
      input.facets,
      config,
      input.timeRange,
      cohort,
    ),
  ]);
  const summarizedCount = Math.min(...counts.map(({ count }) => count));
  return {
    matchedTraceCount,
    capped: summarizedCount >= TOPICS_SLICE_MAX_TRACES,
    summarized: counts,
    summarizedCount,
    minimumTraceCount: TOPICS_ANALYSIS_MIN_TRACES,
    ready: summarizedCount >= TOPICS_ANALYSIS_MIN_TRACES,
  };
}

/** Starts a one-off clustering run over a summarized slice. */
export async function startTopicAnalysis(
  input: {
    projectId: string;
    label: string;
    filter: Filter;
    timeRange: TopicTimeRange;
    facets: TopicFacetRef[];
  },
  userId: string,
) {
  const preview = await previewTopicAnalysis(input);
  if (!preview.ready)
    throw new InvalidRequestError(
      `An analysis needs at least ${TOPICS_ANALYSIS_MIN_TRACES} summarized traces in this slice.`,
    );
  const requestId = randomUUID();
  const execution = await createTopicExecution(
    {
      operation: "update",
      projectId: input.projectId,
      requestId,
      facets: input.facets,
      embeddingConfig: await embeddingConfig(input.projectId),
      timeRange: input.timeRange,
      exploratory: false,
      analysis: {
        label: input.label,
        filter: input.filter,
        seed: TOPICS_ANALYSIS_SAMPLING_SEED,
      },
    },
    createHash("sha256").update(requestId).digest("hex"),
    userId,
  );
  if (execution.status === "queued")
    await enqueueTopicExecution(input.projectId, execution.id);
  return { id: execution.id };
}
