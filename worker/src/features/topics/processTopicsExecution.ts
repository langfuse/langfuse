import Decimal from "decimal.js";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import {
  getCurrentSpan,
  instrumentAsync,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import {
  isTopicsEnabled,
  readTopicExecutionSummary,
  writeTopicExecution,
  getTopicFacetVersion,
  listTopicFacets,
  writeTopicAssignments,
  readTopicAssignments,
  readTopicRunTraceIds,
  createTopicRun,
  getTopicRun,
  getPublishedTopicRun,
  getTopicRule,
  getTopicRuleMap,
  topicAnalysisCohort,
  readTopicMapAssignments,
  getTopicClusteringSummaries,
  getSampledTopicClusteringSummaries,
  summarizedTopicMatchesQuery,
  saveTopicRun,
  getTopicsModels,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import {
  type TopicEmbeddingConfig,
  type TopicExecution,
  type TopicFacetVersion,
  type TopicSummary,
  type TopicRun,
  type TopicFacetProgress,
  type TopicDefinition,
  type TopicTimeRange,
  sameTopicGeometry,
  topicTimeRangeSchema,
} from "@langfuse/shared/topics";
import { prisma } from "@langfuse/shared/src/db";
import {
  nameTopicGroup,
  prepareTopicNamingGroup,
  type NamingConflict,
} from "./models";
import {
  isRejectedConnection,
  pauseForRejectedConnection,
  TopicsProviderUnavailable,
} from "./provider-error";
import {
  buildTopicPrototypes,
  buildNamingEvidence,
  classifyTopic,
  retainPopulatedTopics,
  topicHash,
} from "./classifier";
import { topicAssignmentRows } from "./assignments";
import {
  runTopicClustering,
  topicClusterSettings,
  TOPICS_NUMERIC_VERSION,
} from "./numeric";
import { matchTopicContinuity } from "./continuity";
import { createEventLoopYielder } from "./event-loop";
import { TopicMetrics } from "./metrics";

type UpdateExecution = TopicExecution & {
  input: Extract<TopicExecution["input"], { operation: "update" }>;
};

/** Where a fit's run and assignments belong. */
type FitScope = Pick<
  UpdateExecution["input"],
  | "projectId"
  | "embeddingConfig"
  | "timeRange"
  | "exploratory"
  | "minimumTraceCount"
  | "analysis"
> & {
  /** Rule of a continuous map; null for a one-off snapshot. */
  ruleId: string | null;
  /** Execution of a one-off snapshot; null for a continuous map. */
  batchActionId: string | null;
  /** A setup fit on few or not yet all summaries; the next nightly refit replaces it. */
  provisional?: boolean;
  save: (phase: string) => Promise<void>;
};
type AssignmentScope = Pick<FitScope, "projectId" | "embeddingConfig">;

// Admission policy for full-cohort fitting; excludes child-process and runtime overhead.
const MAX_CLUSTERING_ROWS = 20_000;
const MAX_CLUSTERING_BYTES = 256 * 1024 * 1024;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Topics processing failed.";
const isExecutionFailure = (error: unknown) =>
  error instanceof TopicsProviderUnavailable;
async function saveProgress(
  metrics: TopicMetrics,
  execution: TopicExecution,
  phase: string,
) {
  execution.phase = phase;
  await metrics.measure(
    "storage",
    () => writeTopicExecution(execution),
    "storage",
  );
}

function countSummaries(
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
) {
  progress.counts.complete = summaries.filter(
    (row) => row.state === "complete",
  ).length;
  progress.counts.nonApplicable = summaries.filter(
    (row) => row.state === "not_applicable",
  ).length;
  progress.counts.insufficientInput = summaries.filter(
    (row) => row.state === "insufficient_input",
  ).length;
}

function summaryTimeRange(summaries: TopicSummary[]): TopicTimeRange {
  let from = Infinity;
  let to = -Infinity;
  for (const summary of summaries) {
    const timestamp = Date.parse(summary.unitStartTime);
    from = Math.min(from, timestamp);
    to = Math.max(to, timestamp + 1);
  }
  return topicTimeRangeSchema.parse({ from: new Date(from), to: new Date(to) });
}

async function assignSummaries(
  metrics: TopicMetrics,
  scope: AssignmentScope,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
  run: TopicRun,
  coordinates: Map<string, [number, number]> = new Map(),
  assignedAt = new Date().toISOString(),
) {
  return instrumentAsync(
    { name: "topics.assignment", traceScope: "topics" },
    (span) => {
      span.setAttribute("langfuse.topics.summaries", summaries.length);
      return metrics.measure("assignment", async () => {
        let assignedCount = 0;
        // Keep classification and readback scratch bounded independently of cohort size.
        for (let start = 0; start < summaries.length; start += 1000) {
          const batch = summaries.slice(start, start + 1000);
          const rows: ReturnType<typeof topicAssignmentRows> = [];
          for (let offset = 0; offset < batch.length; offset += 64) {
            rows.push(
              ...topicAssignmentRows({
                projectId: scope.projectId,
                facet: { facetId: facet.facetId, version: facet.version },
                embeddingConfig: scope.embeddingConfig,
                summaries: batch.slice(offset, offset + 64),
                run,
                ruleId: run.ruleId ?? null,
                origin: "initial",
                assignedAt,
                coordinates,
              }),
            );
            await yieldToEventLoop();
          }
          await metrics.measure(
            "storage",
            () => writeTopicAssignments(rows),
            "storage",
          );
          const visible = await readTopicAssignments(
            scope.projectId,
            { facetId: facet.facetId, version: facet.version },
            batch,
            run.id,
            summaryTimeRange(batch),
          );
          const visibleByTrace = new Map(
            visible.map((row) => [row.traceId, row]),
          );
          if (
            rows.some((row) => {
              const persisted = visibleByTrace.get(row.traceId);
              return (
                !persisted ||
                persisted.topicId !== row.topicId ||
                persisted.topicVersionId !== row.topicVersionId ||
                persisted.summaryProcessedAt !== row.summaryProcessedAt
              );
            })
          )
            throw new Error(
              "Topic assignments are not fully visible; map publication is deferred.",
            );
          assignedCount += rows.filter((row) => row.topicId !== null).length;
          await yieldToEventLoop();
        }
        progress.counts.assigned = assignedCount;
        progress.counts.outlier = summaries.length - assignedCount;
        metrics.result("assignment", "assigned", progress.counts.assigned);
        metrics.result("assignment", "outlier", progress.counts.outlier);
      });
    },
  );
}

async function clusterFacet(
  metrics: TopicMetrics,
  models: TopicsModels,
  scope: FitScope,
  facet: TopicFacetVersion,
  facetName: string | undefined,
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
  attempt: TopicRun | null,
  previous: TopicRun | null,
) {
  // A snapshot fits the summaries it has: below the standard minimum it clusters a small sample.
  const exploratory = scope.analysis
    ? summaries.length < topicClusterSettings(false).minimumCount
    : scope.exploratory;
  const numericConfig = {
    ...topicClusterSettings(exploratory, scope.minimumTraceCount),
    numericVersion: TOPICS_NUMERIC_VERSION,
  };
  const config = {
    ...numericConfig,
    exploratory,
    embeddingModel: scope.embeddingConfig.embeddingModel!,
    dimensions: scope.embeddingConfig.embeddingDimensions,
    classifierVersion: "original-cosine-loo95-eps1e-12-v3",
    timeRange: {
      from: scope.timeRange.from.toISOString(),
      to: scope.timeRange.to.toISOString(),
    },
    // Keeps the analysis out of serving; see createTopicExecution.
    ...(scope.analysis ? { analysis: true } : {}),
    ...(scope.provisional ? { provisional: true } : {}),
  };
  let run =
    attempt?.status === "pending"
      ? await saveTopicRun({ ...attempt, config })
      : await createTopicRun({
          projectId: scope.projectId,
          facetId: facet.facetId,
          facetVersion: facet.version,
          config,
          ruleId: scope.ruleId,
          batchActionId: scope.batchActionId,
        });
  progress.runId = run.id;
  // Persist the attempt and selected cohort before any terminal result or inference.
  await scope.save("clustering");
  if (summaries.length < numericConfig.minimumCount) {
    progress.outcome = summaries.length
      ? "insufficient_data"
      : "no_applicable_summaries";
    await saveTopicRun({
      ...run,
      status: "skipped",
      finishedAt: new Date().toISOString(),
    });
    metrics.result("clustering", progress.outcome);
    return;
  }
  run = await saveTopicRun({
    ...run,
    status: "running",
    startedAt: run.startedAt ?? new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
  try {
    metrics.clusteringWorkload(
      summaries.length,
      scope.embeddingConfig.embeddingDimensions,
    );
    const numeric = await instrumentAsync(
      { name: "topics.clustering", traceScope: "topics" },
      async (span) => {
        span.setAttributes({
          "langfuse.topics.clustering.vectors": summaries.length,
          "langfuse.topics.clustering.dimensions":
            scope.embeddingConfig.embeddingDimensions,
        });
        const result = await metrics.measure(
          "clustering",
          () =>
            runTopicClustering(
              summaries.map((row) => row.embedding),
              numericConfig,
            ),
          "numerical",
        );
        span.setAttribute("langfuse.topics.clustering.status", result.status);
        return result;
      },
    );
    const coordinates = new Map(
      summaries
        .map((row, index) => [row.traceId, numeric.coordinates[index]])
        .filter(
          (entry): entry is [string, [number, number]] =>
            typeof entry[0] === "string" && Array.isArray(entry[1]),
        ),
    );
    const prototypes =
      numeric.status === "no_topics"
        ? []
        : await retainPopulatedTopics(
            summaries,
            (await buildTopicPrototypes(summaries, numeric.labels)).map(
              (prototype) => ({
                ...prototype,
                id: topicHash([run.id, prototype.id]).slice(0, 48),
              }),
            ),
          );
    if (!prototypes.length) {
      metrics.result("clustering", "no_topics");
      await assignSummaries(
        metrics,
        scope,
        facet,
        progress,
        summaries,
        run,
        coordinates,
      );
      await saveTopicRun({
        ...run,
        status: "completed",
        finishedAt: new Date().toISOString(),
      });
      progress.outcome = "no_topics";
      return;
    }
    metrics.result("clustering", "topics_found");
    let candidates = prototypes.map((prototype) => ({
      topicVersionId: prototype.id,
      topicId: prototype.id,
      centroid: prototype.centroid,
      radius: prototype.radius,
      metadata: {},
    }));
    const compatiblePrevious =
      previous !== null &&
      compatibleMap(scope.embeddingConfig, facet, previous);
    if (previous) {
      const facetRef = { facetId: facet.facetId, version: facet.version };
      const previousTimeRange = topicTimeRangeSchema.parse(
        previous.config.timeRange,
      );
      const previousTraceIds = await readTopicRunTraceIds(
        scope.projectId,
        facetRef,
        previous.id,
        previousTimeRange,
        MAX_CLUSTERING_ROWS,
      );
      const previousMemberships: {
        traceId: string;
        topicVersionId: string | null;
      }[] = [];
      for (let start = 0; start < previousTraceIds.length; start += 1000) {
        const traceIds = previousTraceIds.slice(start, start + 1000);
        const previousAssignments = await readTopicAssignments(
          scope.projectId,
          facetRef,
          traceIds.map((traceId) => ({ traceId, sessionId: null })),
          previous.id,
          previousTimeRange,
        );
        for (const row of previousAssignments) {
          if (row.traceId !== null)
            previousMemberships.push({
              traceId: row.traceId,
              topicVersionId: row.topicVersionId,
            });
        }
      }
      const candidateMemberships: {
        traceId: string;
        topicVersionId: string | null;
      }[] = [];
      const yieldIfNeeded = createEventLoopYielder();
      for (const summary of summaries) {
        if (summary.traceId === null)
          throw new Error("Topics processing requires a trace summary.");
        candidateMemberships.push({
          traceId: summary.traceId,
          topicVersionId: classifyTopic(summary.embedding, prototypes).topicId,
        });
        const pause = yieldIfNeeded();
        if (pause) await pause;
      }
      candidates = matchTopicContinuity({
        previousTopics: previous.topics,
        candidateTopics: candidates,
        previousMemberships,
        candidateMemberships,
        exploratory,
        compatibleEmbeddingSpace: compatiblePrevious,
      });
    }
    const reused = new Map<string, TopicDefinition>();
    // Continued topics whose definition changed are named again with their previous name as context.
    const renamedFrom = new Map<string, TopicDefinition>();
    candidates = candidates.map((candidate) => {
      const old = previous?.topics.find(
        (topic) => topic.topicId === candidate.topicId,
      );
      if (
        compatiblePrevious &&
        old &&
        !old.metadata.namingFailure &&
        sameTopicGeometry(old, candidate)
      ) {
        reused.set(old.topicVersionId, old);
        return {
          ...candidate,
          topicVersionId: old.topicVersionId,
          centroid: old.centroid,
          radius: old.radius,
        };
      }
      if (compatiblePrevious && old && !old.metadata.namingFailure)
        renamedFrom.set(candidate.topicVersionId, old);
      return candidate;
    });
    // Final version IDs also determine the serving classifier's distance ties.
    const evidence = await buildNamingEvidence(
      summaries,
      await retainPopulatedTopics(
        summaries,
        candidates.map((candidate) => ({
          id: candidate.topicVersionId,
          centroid: candidate.centroid,
          radius: candidate.radius,
        })),
      ),
    );
    await scope.save("naming");
    const topics: TopicDefinition[] = [];
    const named: NamedTopics = new Map();
    for (const group of evidence) {
      const retained = reused.get(group.id);
      if (retained)
        named.set(retained.name.toLowerCase(), {
          name: retained.name,
          description: retained.description,
          summaries: group.members.slice(0, 3).map((member) => member.summary),
        });
    }
    for (const group of evidence) {
      const retained = reused.get(group.id);
      if (retained) {
        topics.push(retained);
        continue;
      }
      const costDetails: Record<string, number> = {};
      const label = await instrumentAsync(
        { name: "topics.naming", traceScope: "topics" },
        (span) => {
          span.setAttributes({
            "langfuse.topics.group_id": group.id,
            "langfuse.topics.group_members": group.members.length,
          });
          return metrics.measure("naming", async () => {
            const prepared = await prepareTopicNamingGroup(
              {
                members: group.members,
                contrasts: group.contrasts.map((member, index) => ({
                  id: `c${index + 1}`,
                  summary: member.summary,
                })),
              },
              topicHash([run.id, group.id]),
            );
            const label = await nameGroupAvoidingConflicts(
              metrics,
              models,
              named,
              {
                ...prepared,
                facetName,
                previousTopic: renamedFrom.get(group.id),
              },
              {
                facet_id: facet.facetId,
                facet_name: facetName,
                facet_version: facet.version,
                execution_id: scope.batchActionId,
                rule_id: scope.ruleId,
                run_id: run.id,
                group_id: group.id,
                effective_member_count: group.count,
                selected_member_count: prepared.members.length,
              },
              (attemptCost) => {
                for (const [key, value] of Object.entries(attemptCost))
                  costDetails[key] = Decimal.add(
                    costDetails[key] ?? 0,
                    value,
                  ).toNumber();
              },
            );
            return {
              ...label,
              selectedMemberCount: prepared.members.length,
              namingSampled: prepared.sampled,
              representativeSummaries: label.evidenceSummaryIds.map((id) => {
                const { facetId, facetVersion, traceId, sessionId } =
                  prepared.members.find((member) => member.id === id)!.source;
                return {
                  facetId,
                  facetVersion,
                  traceId,
                  sessionId: traceId === null ? sessionId : null,
                };
              }),
            };
          });
        },
      ).catch((error: unknown) => {
        if (
          error instanceof TopicsProviderUnavailable &&
          error.reason === "content_filter"
        )
          return null;
        throw error;
      });
      const candidate = candidates.find(
        (topic) => topic.topicVersionId === group.id,
      )!;
      topics.push({
        ...candidate,
        projectId: scope.projectId,
        createdByRunId: run.id,
        createdAt: run.createdAt,
        costDetails,
        labels: [],
        name: label?.name ?? `Unnamed topic ${topics.length + 1}`,
        description:
          label?.description ??
          "The model's content filter prevented naming this topic. Its traces and assignments were preserved.",
        representativeSummaries: label?.representativeSummaries ?? [],
        metadata: {
          ...candidate.metadata,
          effectiveMemberCount: group.count,
          ...(label && {
            selectedMemberCount: label.selectedMemberCount,
            namingSampled: label.namingSampled,
          }),
          namingModel: models.clustering.model,
          ...(!label && { namingFailure: "content_filter" }),
        },
      });
      if (label) metrics.result("naming", "generated");
      if (label && label.name === renamedFrom.get(group.id)?.name)
        metrics.result("naming", "name_kept");
    }
    run = await saveTopicRun({ ...run, topics });
    // Readback returns the persisted classifier precision before creating any memberships.
    await assignSummaries(
      metrics,
      scope,
      facet,
      progress,
      summaries,
      run,
      coordinates,
    );
    const unnamed = run.topics.filter(
      (topic) => topic.metadata.namingFailure === "content_filter",
    ).length;
    run = await saveTopicRun({
      ...run,
      status: "completed",
      error: unnamed
        ? `The model's content filter prevented naming ${unnamed} topic${unnamed === 1 ? "" : "s"}. Traces and assignments were preserved. Choose another clustering model, then run Update topics to retry naming.`
        : null,
      finishedAt: new Date().toISOString(),
    });
    progress.outcome = "published";
    progress.error = run.error;
  } catch (error) {
    await saveTopicRun({
      ...run,
      status: "failed",
      error: errorMessage(error),
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

type NamedTopics = Map<string, NamingConflict>;

/** Groups are named independently, so a name taken in the run gets one conflict-aware retry. */
async function nameGroupAvoidingConflicts(
  metrics: TopicMetrics,
  models: TopicsModels,
  named: NamedTopics,
  group: Parameters<typeof nameTopicGroup>[1],
  metadata: Record<string, unknown> & { run_id: string },
  onCost: (costDetails: Record<string, number>) => void,
) {
  const nameGroup = (conflict?: NamingConflict) =>
    nameTopicGroup(models, group, metadata, conflict, onCost);
  let { output: label } = await nameGroup();
  const conflict = named.get(label.name.toLowerCase());
  if (conflict) {
    metrics.result("naming", "name_conflict");
    // The first name is valid, so a failed rename keeps it.
    label = await nameGroup(conflict).then(
      ({ output }) => output,
      (error: unknown) => {
        metrics.error("naming", error);
        return label;
      },
    );
  }
  if (named.has(label.name.toLowerCase()))
    metrics.result("naming", "duplicate_name");
  else
    named.set(label.name.toLowerCase(), {
      name: label.name,
      description: label.description,
      summaries: label.evidenceSummaryIds.map(
        (id) => group.members.find((member) => member.id === id)!.summary,
      ),
    });
  return label;
}

function compatibleMap(
  embeddingConfig: TopicEmbeddingConfig,
  facet: TopicFacetVersion,
  run: TopicRun,
): boolean {
  return (
    run.facetId === facet.facetId &&
    run.facetVersion === facet.version &&
    run.config.embeddingModel === embeddingConfig.embeddingModel &&
    run.config.dimensions === embeddingConfig.embeddingDimensions
  );
}

type PendingFacet = {
  facet: TopicFacetVersion;
  progress: TopicFacetProgress;
};

async function pendingFacets(
  execution: TopicExecution,
): Promise<PendingFacet[]> {
  const facets: PendingFacet[] = [];
  const definitions = await listTopicFacets(execution.projectId);
  for (const progress of execution.facets) {
    if (progress.outcome !== "pending") continue;
    const facet = await getTopicFacetVersion(
      execution.projectId,
      progress.facetId,
      progress.facetVersion,
    );
    const definition = definitions.find(({ id }) => id === progress.facetId);
    if (!facet || !definition)
      throw new Error("Facet version not found in this project.");
    facets.push({ facet, progress });
  }
  return facets;
}

/** Each unpublished attempt fits the current compatible summaries from scratch. */
async function updateTopics(
  metrics: TopicMetrics,
  models: TopicsModels,
  execution: UpdateExecution,
) {
  const facetNames = new Map(
    (await listTopicFacets(execution.projectId)).map((facet) => [
      facet.id,
      facet.name,
    ]),
  );
  const scope: FitScope = {
    ...execution.input,
    ruleId: null,
    batchActionId: execution.id,
    save: (phase) => saveProgress(metrics, execution, phase),
  };
  for (const { facet, progress } of await pendingFacets(execution)) {
    await instrumentAsync(
      { name: "topics-facet-update", traceScope: "topics" },
      async (span) => {
        span.setAttributes({
          "langfuse.topics.execution_id": execution.id,
          "langfuse.topics.facet_id": facet.facetId,
          "langfuse.topics.facet_version": facet.version,
        });
        try {
          const accepted = progress.runId
            ? await getTopicRun(execution.projectId, progress.runId)
            : null;
          if (
            accepted &&
            (accepted.projectId !== execution.projectId ||
              accepted.facetId !== facet.facetId ||
              accepted.facetVersion !== facet.version)
          )
            throw new Error(
              "Clustering run does not match this facet version.",
            );
          if (accepted?.status === "completed") {
            progress.error = accepted.error;
            const assignments = await readTopicMapAssignments(
              execution.projectId,
              { facetId: facet.facetId, version: facet.version },
              accepted.id,
              topicTimeRangeSchema.parse(accepted.config.timeRange),
            );
            progress.counts.requested = assignments.length;
            progress.counts.complete = assignments.length;
            progress.counts.assigned = assignments.filter(
              (row) => row.topicId !== null,
            ).length;
            progress.counts.outlier =
              assignments.length - progress.counts.assigned;
            progress.outcome = accepted.topics.length
              ? "published"
              : "no_topics";
            await saveProgress(metrics, execution, "processing");
            return;
          }
          if (accepted?.status === "skipped") {
            progress.outcome = progress.counts.requested
              ? "insufficient_data"
              : "no_applicable_summaries";
            await saveProgress(metrics, execution, "processing");
            return;
          }
          const { analysis } = execution.input;
          // An analysis clusters its own filtered sample and always fits fresh.
          const current = analysis
            ? null
            : await getPublishedTopicRun(execution.projectId, facet.facetId);
          const previous =
            current?.facetVersion === facet.version ? current : null;
          const cohort = analysis
            ? await topicAnalysisCohort({
                projectId: execution.projectId,
                filter: analysis.filter,
                timeRange: execution.input.timeRange,
                seed: analysis.seed,
              })
            : undefined;
          const summaries = await getTopicClusteringSummaries(
            execution.projectId,
            facet.facetId,
            facet.version,
            execution.input.embeddingConfig,
            execution.input.timeRange,
            {
              maxRows: MAX_CLUSTERING_ROWS,
              maxBytes: MAX_CLUSTERING_BYTES,
            },
            cohort,
          ).catch(async (error: unknown) => {
            if (accepted?.status === "pending")
              await saveTopicRun({
                ...accepted,
                status: "failed",
                error: errorMessage(error),
                finishedAt: new Date().toISOString(),
              });
            throw error;
          });
          countSummaries(progress, summaries);
          progress.counts.requested = summaries.length;
          await clusterFacet(
            metrics,
            models,
            scope,
            facet,
            facetNames.get(facet.facetId),
            progress,
            summaries,
            accepted,
            previous,
          );
        } catch (error) {
          failFacet(metrics, execution, facet, progress, error);
        }
        await saveProgress(metrics, execution, "processing");
        span.setAttribute("langfuse.topics.facet_outcome", progress.outcome);
      },
    );
  }
}

/** Provider and configuration failures are the customer's to fix; anything else is ours. */
function failFacet(
  metrics: TopicMetrics,
  execution: TopicExecution,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  error: unknown,
) {
  metrics.error("execution", error);
  progress.outcome = "failed";
  progress.error = errorMessage(error);
  const log =
    error instanceof TopicsProviderUnavailable ? logger.warn : logger.error;
  log("Topics facet failed", {
    "langfuse.topics.execution_id": execution.id,
    "langfuse.topics.operation": execution.input.operation,
    "langfuse.topics.facet_id": facet.facetId,
    "langfuse.topics.facet_version": facet.version,
    error: progress.error,
  });
  if (isExecutionFailure(error)) throw error;
  // Handled, but still a failed facet for the user; the enclosing span reports it.
  traceException(error);
}

/** Fits a snapshot's facets over its window; Postgres owns its progress. */
export async function processTopicUpdateExecution({
  projectId,
  executionId,
}: {
  projectId: string;
  executionId: string;
}): Promise<void> {
  if (!isTopicsEnabled()) throw new Error("Topics processing is not enabled.");
  const metadata = await readTopicExecutionSummary(projectId, executionId);
  if (!metadata) throw new Error("Topics execution not found.");
  if (metadata.input.operation !== "update")
    throw new Error("Manual Topics runs can no longer be processed.");
  const execution: UpdateExecution = { ...metadata, input: metadata.input };
  if (
    ["completed", "completed_with_errors"].includes(execution.status) &&
    !execution.facets.some(
      (facet) => facet.outcome === "pending" || facet.outcome === "failed",
    )
  )
    return;
  const metrics = new TopicMetrics();
  const save = (phase: string) => saveProgress(metrics, execution, phase);
  if (execution.status !== "running") metrics.execution("started");
  execution.status = "running";
  execution.error = null;
  for (const progress of execution.facets) {
    if (progress.outcome === "failed") {
      progress.outcome = "pending";
      progress.error = null;
    }
  }
  await save("selecting");
  try {
    const models = await getTopicsModels(projectId);
    if (!models)
      throw new TopicsProviderUnavailable(
        "Choose Topics models for this project before running Topics.",
        "configuration",
      );
    if (
      execution.input.embeddingConfig.embeddingModel !== models.embedding.model
    )
      throw new TopicsProviderUnavailable(
        "The project's embedding model changed after this execution was created; start a new Topics execution.",
        "configuration",
      );
    await updateTopics(metrics, models, execution);
    execution.status = execution.facets.some(
      (facet) => facet.outcome === "failed" || facet.error !== null,
    )
      ? "completed_with_errors"
      : "completed";
    await save("completed");
    metrics.execution(execution.status);
  } catch (error) {
    if (isRejectedConnection(error))
      await pauseForRejectedConnection(projectId, error);
    metrics.error("execution", error);
    metrics.execution("failed");
    execution.status = "failed";
    execution.error = errorMessage(error);
    await save("failed");
  } finally {
    getCurrentSpan()?.setAttributes({
      "langfuse.project.id": projectId,
      "langfuse.topics.execution_id": executionId,
      "langfuse.topics.operation": execution.input.operation,
      "langfuse.topics.execution_status": execution.status,
      "langfuse.topics.execution_phase": execution.phase,
    });
  }
}

/** The project's models, which must still embed as they did when the refit was scheduled. */
async function scheduledModels(
  projectId: string,
  embeddingConfig: TopicEmbeddingConfig,
): Promise<TopicsModels> {
  const models = await getTopicsModels(projectId);
  if (
    !models ||
    models.embedding.model !== embeddingConfig.embeddingModel ||
    models.embedding.dimensions !== embeddingConfig.embeddingDimensions
  )
    throw new TopicsProviderUnavailable(
      "The project's Topics models changed after this refit was scheduled.",
      "configuration",
    );
  return models;
}

// Fits leave a fifth of the clustering capacity as headroom.
const refitLimits = () => ({
  maxRows: Math.max(
    topicClusterSettings(false).minimumCount,
    Math.floor(MAX_CLUSTERING_ROWS * 0.8),
  ),
  maxBytes: Math.max(1, Math.floor(MAX_CLUSTERING_BYTES * 0.8)),
});

/**
 * A stable hash sample of the summaries whose trace meets the rule's current
 * filter, so consecutive nights refit mostly the same traces, and the window it covers.
 */
async function refitCohort({
  projectId,
  ruleId,
  facet,
  embeddingConfig,
  scheduled,
}: {
  projectId: string;
  ruleId: string;
  facet: TopicFacetVersion;
  embeddingConfig: TopicEmbeddingConfig;
  scheduled: TopicTimeRange;
}): Promise<{ summaries: TopicSummary[]; timeRange: TopicTimeRange }> {
  const filter = (await getTopicRule(projectId, ruleId))?.filter ?? [];
  const { summaries, timeRange } = await getSampledTopicClusteringSummaries(
    projectId,
    facet,
    embeddingConfig,
    scheduled,
    refitLimits(),
    filter.length
      ? (window) =>
          summarizedTopicMatchesQuery(
            { projectId, facet, filter, ...window },
            prisma,
          )
      : undefined,
  );
  getCurrentSpan()?.setAttribute(
    "langfuse.topics.refit_window_days",
    (timeRange.to.getTime() - timeRange.from.getTime()) / 86_400_000,
  );
  return { summaries, timeRange };
}

/**
 * The map a refit continues, so its topics keep their IDs and names: the rule's
 * published map of the facet, or the snapshot no rule owns while the rule has
 * none. Another rule's map and another facet version are not continued.
 */
async function continuedMap(
  projectId: string,
  ruleId: string,
  facet: TopicFacetVersion,
): Promise<TopicRun | null> {
  const own = await getTopicRuleMap(projectId, ruleId, facet.facetId);
  const serving = own
    ? null
    : await getPublishedTopicRun(projectId, facet.facetId);
  const current = own ?? (serving?.ruleId ? null : serving);
  return current?.facetVersion === facet.version ? current : null;
}

/**
 * Fits one pending run of a rule's continuous map over the window the scheduler
 * stored on it, continuing the rule's published map of the facet. Summaries
 * stored while the fit runs join the map with the next refit.
 */
export async function processTopicRuleRefit({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}): Promise<void> {
  if (!isTopicsEnabled()) throw new Error("Topics processing is not enabled.");
  const run = await getTopicRun(projectId, runId);
  if (!run?.ruleId) throw new Error("Topics rule refit run not found.");
  if (run.status === "running") {
    // A replayed job would rename the saved topics; the next slot refits instead.
    await saveTopicRun({
      ...run,
      status: "failed",
      error: "Interrupted; the next nightly refit replaces it.",
      finishedAt: new Date().toISOString(),
    });
    return;
  }
  if (run.status !== "pending") return;
  const ruleId = run.ruleId;
  const metrics = new TopicMetrics();
  const startedAt = performance.now();
  let failure: unknown;
  const progress: TopicFacetProgress = {
    facetId: run.facetId,
    facetVersion: run.facetVersion,
    outcome: "pending",
    runId,
    error: null,
    counts: {
      requested: 0,
      complete: 0,
      nonApplicable: 0,
      insufficientInput: 0,
      failed: 0,
      assigned: 0,
      outlier: 0,
    },
  };
  await instrumentAsync(
    { name: "topics-rule-refit", traceScope: "topics" },
    async (span) => {
      span.setAttributes({
        "langfuse.project.id": projectId,
        "langfuse.topics.rule_id": ruleId,
        "langfuse.topics.run_id": runId,
        "langfuse.topics.facet_id": run.facetId,
        "langfuse.topics.facet_version": run.facetVersion,
      });
      try {
        const embeddingConfig = {
          embeddingModel: String(run.config.embeddingModel),
          embeddingDimensions: Number(run.config.dimensions),
        };
        const models = await scheduledModels(projectId, embeddingConfig);
        const facet = await getTopicFacetVersion(
          projectId,
          run.facetId,
          run.facetVersion,
        );
        if (!facet) throw new Error("Facet version not found in this project.");
        const { summaries, timeRange } = await refitCohort({
          projectId,
          ruleId,
          facet,
          embeddingConfig,
          scheduled: topicTimeRangeSchema.parse(run.config.timeRange),
        });
        const previous = await continuedMap(projectId, ruleId, facet);
        countSummaries(progress, summaries);
        progress.counts.requested = summaries.length;
        await clusterFacet(
          metrics,
          models,
          {
            projectId,
            embeddingConfig,
            timeRange,
            // Setup stores these on the run; nightly refits never do. A manual
            // refresh falls back to small-sample mode below the standard minimum.
            exploratory:
              run.config.exploratory === true ||
              (run.config.refresh === true &&
                summaries.length < topicClusterSettings(false).minimumCount),
            provisional: run.config.provisional === true,
            ruleId,
            batchActionId: null,
            save: async () => {},
          },
          facet,
          (await listTopicFacets(projectId)).find(
            ({ id }) => id === facet.facetId,
          )?.name,
          progress,
          summaries,
          run,
          previous,
        );
      } catch (error) {
        progress.outcome = "failed";
        failure = error;
        metrics.error("execution", error);
        if (isRejectedConnection(error))
          await pauseForRejectedConnection(projectId, error);
        // clusterFacet fails the run once fitting starts; earlier failures land here.
        const latest = await getTopicRun(projectId, runId);
        if (latest?.status === "pending" || latest?.status === "running")
          await saveTopicRun({
            ...latest,
            status: "failed",
            error: errorMessage(error),
            finishedAt: new Date().toISOString(),
          });
        const log =
          error instanceof TopicsProviderUnavailable
            ? logger.warn
            : logger.error;
        log("Topics rule refit failed", {
          projectId,
          ruleId,
          runId,
          error: errorMessage(error),
        });
        if (!(error instanceof TopicsProviderUnavailable))
          traceException(error);
      }
      span.setAttribute("langfuse.topics.facet_outcome", progress.outcome);
    },
  );
  metrics.ruleFit(
    progress.outcome,
    run.config.refresh === true ? "manual" : "automatic",
    performance.now() - startedAt,
    failure,
  );
}
