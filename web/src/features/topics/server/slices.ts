import { createHash, randomUUID } from "node:crypto";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  TOPICS_ANALYSIS_MIN_TRACES,
  TOPICS_SLICE_MAX_TRACES,
  type TopicAnalysisConfig,
  type TopicExecutionSummary,
  type TopicFacetRef,
  type TopicRule,
  type TopicTimeRange,
  type TopicsRefitIntervalHours,
} from "@langfuse/shared/topics";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getLatestFacetSummaries,
  getTopicAnalysisRun,
  getTopicRuleRefits,
  getTopicRun,
  getTopicSummaryCounts,
  getTopicsModels,
  listTopicAnalysisExecutions,
  listTopicFacets,
  listTopicRules,
  readTopicExecutionSummary,
  readTopicMapAssignments,
  selectTopicTraceRows,
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

/**
 * The narrowest rule whose every filter the analysis also applies; an analysis
 * of a rule's slice compares against that rule's map.
 */
export function parentRuleFor(
  rules: TopicRule[],
  filter: Filter,
): TopicRule | null {
  const applied = new Set(filter.map((item) => JSON.stringify(item)));
  return (
    rules
      .filter((rule) =>
        rule.filter.every((item) => applied.has(JSON.stringify(item))),
      )
      .sort((a, b) => b.filter.length - a.filter.length)[0] ?? null
  );
}

/** Rules with refit timing, and analyses with their runs, for the map picker. */
export async function topicMapsOverview(
  projectId: string,
  prisma: PrismaClient,
) {
  const [rules, refits, config, executions] = await Promise.all([
    listTopicRules(projectId),
    getTopicRuleRefits(projectId),
    prisma.topicConfig.findUnique({
      where: { projectId },
      select: { refitIntervalHours: true },
    }),
    listTopicAnalysisExecutions(projectId),
  ]);
  const refitIntervalHours = (config?.refitIntervalHours ??
    24) as TopicsRefitIntervalHours;
  const analyses = executions.filter(isAnalysis);
  const byId = new Map(analyses.map((execution) => [execution.id, execution]));
  const rootOf = (execution: AnalysisExecution) => {
    let current = execution;
    const seen = new Set<string>();
    while (current.input.analysis.previousExecutionId) {
      const previous = byId.get(current.input.analysis.previousExecutionId);
      if (!previous || seen.has(previous.id)) break;
      seen.add(previous.id);
      current = previous;
    }
    return current;
  };
  const groups = new Map<string, AnalysisExecution[]>();
  for (const execution of analyses) {
    const root = rootOf(execution).id;
    groups.set(root, [...(groups.get(root) ?? []), execution]);
  }
  const ruleName = new Map(rules.map((rule) => [rule.id, rule.name]));
  return {
    refitIntervalHours,
    rules: rules.map((rule) => {
      const lastRefitAt = refits.get(rule.id) ?? null;
      return {
        ...rule,
        lastRefitAt: lastRefitAt?.toISOString() ?? null,
        nextRefitAt: lastRefitAt
          ? new Date(
              lastRefitAt.getTime() + refitIntervalHours * 3_600_000,
            ).toISOString()
          : null,
      };
    }),
    analyses: [...groups].map(([id, runs]) => {
      const latest = runs[0];
      const { analysis } = latest.input;
      return {
        id,
        label: analysis.label,
        filter: analysis.filter,
        parentRuleId: analysis.parentRuleId,
        parentRuleName: analysis.parentRuleId
          ? (ruleName.get(analysis.parentRuleId) ?? null)
          : null,
        facetIds: latest.input.facets.map(({ facetId }) => facetId),
        latestExecutionId: latest.id,
        runs: runs.map((run) => ({
          executionId: run.id,
          previousExecutionId: run.input.analysis.previousExecutionId,
          status: run.status,
          createdAt: run.createdAt,
          timeRange: run.input.timeRange,
          traceCount: Math.max(
            0,
            ...run.facets.map((facet) => facet.counts.requested),
          ),
        })),
      };
    }),
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
            onlyAssigned: true,
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
          onlyAssigned: true,
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

export type TopicRunChange = "new" | "grown" | "shrunk" | "gone" | "stable";

/** A topic's share changing by less than a fifth counts as stable. */
export function topicRunChange(
  previousShare: number,
  currentShare: number,
): TopicRunChange {
  if (previousShare === 0) return currentShare === 0 ? "stable" : "new";
  if (currentShare === 0) return "gone";
  const ratio = currentShare / previousShare;
  if (ratio >= 1.2) return "grown";
  if (ratio <= 0.8) return "shrunk";
  return "stable";
}

async function runCounts(
  projectId: string,
  runId: string,
  timeRange: TopicTimeRange,
) {
  const run = await getTopicRun(projectId, runId);
  if (!run || run.status !== "completed") return null;
  const counts = new Map<string, number>();
  const rows = await readTopicMapAssignments(
    projectId,
    { facetId: run.facetId, version: run.facetVersion },
    run.id,
    timeRange,
  );
  for (const row of rows)
    if (row.topicId)
      counts.set(row.topicId, (counts.get(row.topicId) ?? 0) + 1);
  return { run, counts, total: rows.length };
}

/**
 * Compares an analysis run with the run it reran. Continuity matching keeps a
 * topic's ID across runs, so topics pair by ID; shares are compared, not counts,
 * because the windows can hold different numbers of traces.
 */
export async function analysisRunDiff(projectId: string, executionId: string) {
  const execution = await requireAnalysis(projectId, executionId);
  const previousId = execution.input.analysis.previousExecutionId;
  if (!previousId) return { previousExecutionId: null, facets: [] };
  const previous = await requireAnalysis(projectId, previousId);
  const facets = await Promise.all(
    execution.facets.map(async (progress) => {
      const previousRun = await getTopicAnalysisRun(
        projectId,
        previous.id,
        progress.facetId,
      );
      const [current, before] = await Promise.all([
        progress.runId
          ? runCounts(projectId, progress.runId, execution.input.timeRange)
          : null,
        previousRun
          ? runCounts(projectId, previousRun.id, previous.input.timeRange)
          : null,
      ]);
      if (!current || !before) return null;
      const names = new Map(
        [...before.run.topics, ...current.run.topics].map((topic) => [
          topic.topicId,
          topic.name,
        ]),
      );
      const topics = [...names].map(([topicId, name]) => {
        const previousCount = before.counts.get(topicId) ?? 0;
        const currentCount = current.counts.get(topicId) ?? 0;
        const previousShare = before.total ? previousCount / before.total : 0;
        const currentShare = current.total ? currentCount / current.total : 0;
        return {
          topicId,
          name,
          previousCount,
          currentCount,
          previousShare,
          currentShare,
          change: topicRunChange(previousShare, currentShare),
        };
      });
      return {
        facetId: progress.facetId,
        previousTotal: before.total,
        currentTotal: current.total,
        topics: topics.sort((a, b) => b.currentCount - a.currentCount),
      };
    }),
  );
  return {
    previousExecutionId: previous.id,
    previousTimeRange: previous.input.timeRange,
    facets: facets.flatMap((facet) => (facet ? [facet] : [])),
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

async function analysisCohort(
  projectId: string,
  filter: Filter,
  timeRange: TopicTimeRange,
  seed: string,
  prisma: PrismaClient,
) {
  return (
    await selectTopicTraceRows(
      {
        projectId,
        filter,
        from: timeRange.from,
        to: timeRange.to,
        limit: TOPICS_SLICE_MAX_TRACES,
        sampling: "random",
        seed,
      },
      prisma,
      "ids",
    )
  ).map((row) => row.id);
}

/** How many traces an analysis would cluster, per facet; Run needs enough of them. */
export async function previewTopicAnalysis(
  input: {
    projectId: string;
    filter: Filter;
    timeRange: TopicTimeRange;
    facets: TopicFacetRef[];
  },
  prisma: PrismaClient,
) {
  const [traceIds, rules, config] = await Promise.all([
    analysisCohort(
      input.projectId,
      input.filter,
      input.timeRange,
      "preview",
      prisma,
    ),
    listTopicRules(input.projectId),
    embeddingConfig(input.projectId),
  ]);
  const counts = traceIds.length
    ? await getTopicSummaryCounts(
        input.projectId,
        input.facets,
        config,
        input.timeRange,
        traceIds,
      )
    : input.facets.map(({ facetId, version }) => ({
        facetId,
        facetVersion: version,
        count: 0,
      }));
  const summarizedCount = Math.min(...counts.map(({ count }) => count));
  const parentRule = parentRuleFor(rules, input.filter);
  return {
    matchedTraceCount: traceIds.length,
    capped: traceIds.length >= TOPICS_SLICE_MAX_TRACES,
    summarized: counts,
    summarizedCount,
    minimumTraceCount: TOPICS_ANALYSIS_MIN_TRACES,
    ready: summarizedCount >= TOPICS_ANALYSIS_MIN_TRACES,
    parentRule: parentRule
      ? { id: parentRule.id, name: parentRule.name }
      : null,
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
    previousExecutionId?: string | null;
  },
  userId: string,
  prisma: PrismaClient,
) {
  const preview = await previewTopicAnalysis(input, prisma);
  if (!preview.ready)
    throw new InvalidRequestError(
      `An analysis needs at least ${TOPICS_ANALYSIS_MIN_TRACES} summarized traces. Process past traces for this slice first.`,
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
        parentRuleId: preview.parentRule?.id ?? null,
        previousExecutionId: input.previousExecutionId ?? null,
        seed: requestId,
      },
    },
    createHash("sha256").update(requestId).digest("hex"),
    userId,
  );
  if (execution.status === "queued")
    await enqueueTopicExecution(input.projectId, execution.id);
  return { id: execution.id };
}

/** Reruns an analysis with the same slice and facets over a new window. */
export async function rerunTopicAnalysis(
  input: { projectId: string; executionId: string; timeRange: TopicTimeRange },
  userId: string,
  prisma: PrismaClient,
) {
  const previous = await requireAnalysis(input.projectId, input.executionId);
  const facets = await listTopicFacets(input.projectId);
  return startTopicAnalysis(
    {
      projectId: input.projectId,
      label: previous.input.analysis.label,
      filter: previous.input.analysis.filter,
      timeRange: input.timeRange,
      // Rerun on the current facet versions so the new run reflects prompt edits.
      facets: previous.input.facets.map(({ facetId, version }) => ({
        facetId,
        version:
          facets.find((facet) => facet.id === facetId)?.versions[0]?.version ??
          version,
      })),
      previousExecutionId: previous.id,
    },
    userId,
    prisma,
  );
}
