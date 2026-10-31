import {
  getTopicProcessingMapIds,
  getTopicRun,
} from "@langfuse/shared/topics/server";
import type {
  TopicEmbeddingConfig,
  TopicFacetRef,
  TopicRun,
} from "@langfuse/shared/topics";

// A trace summarized within this window of a publish is assigned to the previous map.
const SERVING_RUN_TTL_MS = 60_000;
const MAX_SERVING_RUN_KEYS = 10_000;
// Completed runs never change; about 1–4 MB each at 100 topics.
const MAX_CACHED_RUNS = 256;

const servingRunIds = new Map<
  string,
  { runId: Promise<string | null>; expiresAt: number }
>();
const completedRuns = new Map<string, Promise<TopicRun | null>>();

function servingRunId(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
): Promise<string | null> {
  const key = JSON.stringify([
    projectId,
    facet.facetId,
    facet.version,
    embeddingConfig.embeddingModel,
    embeddingConfig.embeddingDimensions,
  ]);
  const now = Date.now();
  const cached = servingRunIds.get(key);
  if (cached && cached.expiresAt > now) return cached.runId;

  if (servingRunIds.size >= MAX_SERVING_RUN_KEYS) servingRunIds.clear();
  const runId = getTopicProcessingMapIds(
    projectId,
    [facet],
    embeddingConfig,
  ).then(([map]) => map?.runId ?? null);
  servingRunIds.set(key, { runId, expiresAt: now + SERVING_RUN_TTL_MS });
  runId.catch(() => servingRunIds.delete(key));
  return runId;
}

function completedRun(
  projectId: string,
  runId: string,
): Promise<TopicRun | null> {
  const key = JSON.stringify([projectId, runId]);
  const cached = completedRuns.get(key);
  if (cached) {
    completedRuns.delete(key);
    completedRuns.set(key, cached);
    return cached;
  }

  const run = getTopicRun(projectId, runId).then((row) =>
    row?.status === "completed" ? row : null,
  );
  completedRuns.set(key, run);
  // Only completed runs are immutable; anything else is read again next time.
  run.then(
    (row) => {
      if (!row) completedRuns.delete(key);
    },
    () => completedRuns.delete(key),
  );
  while (completedRuns.size > MAX_CACHED_RUNS)
    completedRuns.delete(completedRuns.keys().next().value!);
  return run;
}

/** The completed map that serves this facet version and vector space, cached per pod. */
export async function getServingTopicRun(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
): Promise<TopicRun | null> {
  const runId = await servingRunId(projectId, facet, embeddingConfig);
  return runId ? completedRun(projectId, runId) : null;
}
