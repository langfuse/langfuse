import { createHash } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import { InvalidRequestError } from "@langfuse/shared";
import {
  logger,
  QueueJobs,
  recordIncrement,
  redis,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getTopicProcessingMapIds,
  getTopicRun,
  listTopicRules,
  topicRuleRunWhere,
  getTopicClusteringSummaryTimeline,
  getTopicExecutionQueueState,
  getEnabledTopicsModels,
  listTopicSummaries,
  readTopicAssignments,
  readTopicExecutionSummary,
  TOPICS_ACTION_TYPES,
  TOPICS_SYSTEM_USER_ID,
  resolveTopicClusteringCohort,
  TOPIC_CLUSTERING_CAPACITY_ERROR,
  TopicsAutomationQueue,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import type {
  TopicEmbeddingConfig,
  TopicExecutionSummary,
  TopicFacetRef,
  TopicRule,
  TopicRun,
  TopicSummary,
  TopicTimeRange,
} from "@langfuse/shared/topics";
import { topicAssignmentRows } from "./assignments";
import { TopicMetrics } from "./metrics";
import { topicClusterSettings } from "./numeric";
import { env } from "../../env";

type AutomationBatch = TQueueJobTypes[QueueName.TopicsAutomation]["payload"];

const DISCOVERY_WINDOW_MS = 7 * 24 * 60 * 60_000;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Assigns the batch's current complete summaries to each matched rule's compatible
 * serving map per facet, skipping ones already assigned, or starts the rule's first
 * discovery for the facet once enough exist. A batch without rule IDs predates rules
 * and serves the project's oldest rule.
 */
export async function processTopicsAutomation(
  batch: AutomationBatch,
): Promise<void> {
  const { projectId, embeddingConfig } = batch;
  const rules = await listTopicRules(projectId);
  // A project without rules keeps its project-wide maps for every facet.
  let matched: (TopicRule | undefined)[] = [undefined];
  if (rules.length)
    matched = batch.ruleIds
      ? rules.filter((rule) => batch.ruleIds!.includes(rule.id))
      : rules.slice(0, 1);
  for (const rule of matched) {
    if (rule?.enabled === false) continue;
    for (const facet of batch.facets) {
      if (rule && !rule.facetIds.includes(facet.facetId)) continue;
      const [map] = await getTopicProcessingMapIds(
        projectId,
        [facet],
        embeddingConfig,
        rule?.id,
      );
      const run = map?.runId ? await getTopicRun(projectId, map.runId) : null;
      if (run?.status === "completed") {
        const summaries = await currentSummaries(batch, facet);
        if (summaries.length > 0) await assign(batch, facet, summaries, run);
      } else await startDiscovery(batch, facet, rule?.id);
    }
  }
}

const DISCOVERY_SIGNAL_TTL_MS = 60_000;
const MAX_DISCOVERY_SIGNAL_KEYS = 10_000;
const discoverySignals = new Map<string, number>();

/**
 * Queues the delayed discovery check for a facet, or a rule's facet, that has no
 * compatible map yet, at most once a minute per pod; the queue deduplicates across pods.
 */
export async function signalTopicsDiscovery(
  summary: TopicSummary & { traceId: string },
  ruleId?: string,
): Promise<void> {
  const facet = { facetId: summary.facetId, version: summary.facetVersion };
  const embeddingConfig = {
    embeddingModel: summary.embeddingModel,
    embeddingDimensions: summary.embedding.length,
  };
  const key = hash([summary.projectId, facet, embeddingConfig, ruleId ?? null]);
  const now = Date.now();
  if ((discoverySignals.get(key) ?? 0) > now) return;
  if (discoverySignals.size >= MAX_DISCOVERY_SIGNAL_KEYS)
    discoverySignals.clear();
  discoverySignals.set(key, now + DISCOVERY_SIGNAL_TTL_MS);
  const start = new Date(summary.unitStartTime);
  try {
    await deferDiscovery(
      {
        projectId: summary.projectId,
        embeddingConfig,
        timeRange: { from: start, to: new Date(start.getTime() + 1) },
        traceIds: [summary.traceId],
        facets: [facet],
        ...(ruleId ? { ruleIds: [ruleId] } : {}),
      },
      facet,
    );
  } catch (error) {
    discoverySignals.delete(key);
    throw error;
  }
}

async function currentSummaries(batch: AutomationBatch, facet: TopicFacetRef) {
  const { embeddingConfig } = batch;
  const rows = await listTopicSummaries(
    batch.projectId,
    {
      traceIds: batch.traceIds,
      facetId: facet.facetId,
      facetVersion: facet.version,
    },
    batch.timeRange,
  );
  return rows.filter(
    (row) =>
      row.state === "complete" &&
      row.traceId !== null &&
      row.embeddingModel === embeddingConfig.embeddingModel &&
      row.embedding.length === embeddingConfig.embeddingDimensions,
  );
}

async function assign(
  batch: AutomationBatch,
  facet: TopicFacetRef,
  summaries: TopicSummary[],
  run: TopicRun,
) {
  const metrics = new TopicMetrics();
  await metrics.measure("assignment", async () => {
    const assigned = new Set(
      (
        await readTopicAssignments(
          batch.projectId,
          facet,
          summaries,
          run.id,
          batch.timeRange,
        )
      ).map((row) => JSON.stringify([row.traceId, row.summaryProcessedAt])),
    );
    const pending = summaries.filter(
      (row) => !assigned.has(JSON.stringify([row.traceId, row.processedAt])),
    );
    if (pending.length === 0) return;
    const rows = topicAssignmentRows({
      projectId: batch.projectId,
      facet,
      embeddingConfig: batch.embeddingConfig,
      summaries: pending,
      run,
      origin: "online",
      assignedAt: new Date().toISOString(),
    });
    await writeTopicAssignments(rows);
    const topics = rows.filter((row) => row.topicId !== null).length;
    metrics.result("assignment", "assigned", topics);
    metrics.result("assignment", "outlier", rows.length - topics);
  });
}

/** Each capacity failure gets one deterministic successor with a smaller window. */
async function startDiscovery(
  batch: AutomationBatch,
  facet: TopicFacetRef,
  ruleId: string | undefined,
) {
  const { projectId, embeddingConfig } = batch;
  if (!(await usesCurrentEmbedding(projectId, embeddingConfig))) return;
  let existing = await latestDiscovery(batch, facet, ruleId);
  if (await continueDiscovery(batch, facet, existing)) return;
  if (await hasMapOrFit(projectId, facet, ruleId)) return;
  // Bound concurrent searches and repeated probes when no admissible window exists.
  const discoveryKey = hash([
    "topics-discovery",
    facet,
    embeddingConfig,
    ruleId,
  ]);
  const gateKey = `langfuse:topics:discovery:${projectId}:${discoveryKey}`;
  if (redis && (await redis.set(gateKey, "1", "EX", 60, "NX")) !== "OK") {
    await deferDiscovery(batch, facet);
    return;
  }
  // Another callback may have advanced discovery while this one waited for Redis.
  existing = await latestDiscovery(batch, facet, ruleId);
  if (await continueDiscovery(batch, facet, existing)) return;
  if (await hasMapOrFit(projectId, facet, ruleId)) return;
  const timeRange = await selectDiscoveryWindow(
    projectId,
    facet,
    embeddingConfig,
    ruleId,
    existing?.input.operation === "update" &&
      discoveryCapacityFailure(existing, facet)
      ? existing.input.timeRange
      : undefined,
  ).catch(async (error: unknown) => {
    await redis?.del(gateKey);
    throw error;
  });
  if (!timeRange) return;
  // Probes can outlive the cooldown; never replace a newer attempt's window.
  const latest = await latestDiscovery(batch, facet, ruleId);
  if (latest?.id !== existing?.id || latest?.status !== existing?.status) {
    await deferDiscovery(batch, facet);
    return;
  }
  if (await hasMapOrFit(projectId, facet, ruleId)) return;
  const requestId = existing ? hash([discoveryKey, existing.id]) : discoveryKey;
  // Monitor before dispatch so the last incoming batch can recover a later failure.
  await deferDiscovery(batch, facet);
  let execution;
  try {
    execution = await createTopicExecution(
      {
        projectId,
        requestId,
        operation: "update",
        facets: [facet],
        embeddingConfig,
        timeRange,
        exploratory: false,
        ruleId,
      },
      requestId,
      TOPICS_SYSTEM_USER_ID,
    );
  } catch (error) {
    // A concurrent job created it first with its own time range.
    if (error instanceof InvalidRequestError) return;
    throw error;
  }
  await enqueueTopicExecution(projectId, execution.id);
  recordIncrement("langfuse.topics.automatic_discoveries", 1);
  logger.info("Started automatic Topics discovery", {
    projectId,
    facetId: facet.facetId,
    facetVersion: facet.version,
    ruleId,
  });
}

/**
 * Read only the latest matching request of the rule. Discoveries from before rules
 * carry no rule; the oldest rule's pre-rule maps stop rediscovery through hasMapOrFit.
 */
async function latestDiscovery(
  batch: AutomationBatch,
  facet: TopicFacetRef,
  ruleId: string | undefined,
) {
  const row = await prisma.batchAction.findFirst({
    where: {
      projectId: batch.projectId,
      actionType: { in: TOPICS_ACTION_TYPES },
      userId: TOPICS_SYSTEM_USER_ID,
      AND: [
        { config: { path: ["inputSettings", "operation"], equals: "update" } },
        { config: { path: ["inputSettings", "facets"], equals: [facet] } },
        ...(ruleId
          ? [{ config: { path: ["inputSettings", "ruleId"], equals: ruleId } }]
          : []),
        {
          config: {
            path: ["inputSettings", "embeddingConfig"],
            equals: batch.embeddingConfig,
          },
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return row ? readTopicExecutionSummary(batch.projectId, row.id) : null;
}

/**
 * Active work is monitored. A capacity failure permits another discovery on a
 * smaller window; a fit that found too little data permits one on a full
 * window once the discovery gate's cooldown passes.
 */
async function continueDiscovery(
  batch: AutomationBatch,
  facet: TopicFacetRef,
  existing: TopicExecutionSummary | null,
): Promise<boolean> {
  if (!existing) return false;
  if (existing.status === "queued") {
    await deferDiscovery(batch, facet);
    await enqueueTopicExecution(batch.projectId, existing.id);
    return true;
  }
  if (existing.status === "running") {
    const state = await getTopicExecutionQueueState(existing);
    if (["failed", "completed", "unknown", "missing"].includes(state)) {
      // Queue failure can outlive persisted running status. Recheck progress in
      // case admission recorded a capacity failure while the queue was read.
      const current = await readTopicExecutionSummary(
        batch.projectId,
        existing.id,
      );
      if (current && discoveryCapacityFailure(current, facet))
        await deferDiscovery(batch, facet);
      return true;
    }
    await deferDiscovery(batch, facet);
    return true;
  }
  if (discoveryLackedData(existing, facet)) return false;
  const capacityFailure = discoveryCapacityFailure(existing, facet);
  if (!capacityFailure) return true;
  // Admission can fail before a precreated run enters the fitting lifecycle.
  if (capacityFailure.runId)
    await prisma.topicClusteringRun.updateMany({
      where: {
        projectId: batch.projectId,
        id: capacityFailure.runId,
        facetId: facet.facetId,
        facetVersion: facet.version,
        status: "pending",
      },
      data: {
        status: "failed",
        error: TOPIC_CLUSTERING_CAPACITY_ERROR,
        finishedAt: new Date(),
      },
    });
  return false;
}

function discoveryCapacityFailure(
  execution: TopicExecutionSummary,
  facet: TopicFacetRef,
) {
  return ["failed", "completed_with_errors"].includes(execution.status)
    ? execution.facets.find(
        (progress) =>
          progress.facetId === facet.facetId &&
          progress.facetVersion === facet.version &&
          progress.outcome === "failed" &&
          progress.error === TOPIC_CLUSTERING_CAPACITY_ERROR,
      )
    : undefined;
}

function discoveryLackedData(
  execution: TopicExecutionSummary,
  facet: TopicFacetRef,
) {
  return (
    ["completed", "completed_with_errors"].includes(execution.status) &&
    execution.facets.some(
      (progress) =>
        progress.facetId === facet.facetId &&
        progress.facetVersion === facet.version &&
        (progress.outcome === "insufficient_data" ||
          progress.outcome === "no_applicable_summaries"),
    )
  );
}

/** One delayed check per facet/model, including a successor to an active check. */
async function deferDiscovery(batch: AutomationBatch, facet: TopicFacetRef) {
  const queue = TopicsAutomationQueue.getInstance();
  if (!queue)
    throw new Error("Topics discovery requires its automation queue.");
  const timestamp = new Date();
  const delay = 60_000;
  const key = hash([
    batch.projectId,
    facet,
    batch.embeddingConfig,
    ...(batch.ruleIds ? [batch.ruleIds] : []),
  ]);
  const id = hash([key, Math.floor((timestamp.getTime() + delay) / delay)]);
  await queue.add(
    QueueJobs.TopicsAutomation,
    {
      id,
      timestamp,
      name: QueueJobs.TopicsAutomation,
      payload: { ...batch, facets: [facet] },
    },
    { jobId: id, delay, deduplication: { id: key, keepLastIfActive: true } },
  );
}

/**
 * Keep a complete recent cohort of the rule the fit serves; only aggregate
 * counts and byte estimates are loaded.
 */
async function selectDiscoveryWindow(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
  ruleId: string | undefined,
  failedWindow?: TopicTimeRange,
): Promise<TopicTimeRange | null> {
  const to = new Date();
  const minimumCount = topicClusterSettings(false).minimumCount;
  if (env.LANGFUSE_TOPICS_MAX_CLUSTERING_ROWS < minimumCount) return null;
  const limits = {
    maxRows: Math.max(
      minimumCount,
      Math.floor(env.LANGFUSE_TOPICS_MAX_CLUSTERING_ROWS * 0.8),
    ),
    maxBytes: Math.max(
      1,
      Math.floor(env.LANGFUSE_TOPICS_MAX_CLUSTERING_BYTES * 0.8),
    ),
  };
  // A capacity failure retries with at most half its window.
  const duration = failedWindow
    ? Math.min(
        DISCOVERY_WINDOW_MS,
        Math.max(
          1,
          Math.floor(
            (failedWindow.to.getTime() - failedWindow.from.getTime()) / 2,
          ),
        ),
      )
    : DISCOVERY_WINDOW_MS;
  const window = { from: new Date(to.getTime() - duration), to };
  const { cohort } = await resolveTopicClusteringCohort({
    projectId,
    timeRange: window,
    ruleId,
  });
  const timeline = await getTopicClusteringSummaryTimeline(
    projectId,
    facet.facetId,
    facet.version,
    embeddingConfig,
    window,
    cohort,
  );
  // The longest window ending now whose summaries fit, if it has enough of them.
  let count = 0;
  let bytes = 0;
  let from: number | null = null;
  for (const minute of timeline) {
    count += minute.count;
    bytes += minute.bytes;
    if (count > limits.maxRows || bytes > limits.maxBytes) break;
    if (count >= minimumCount)
      from = Math.max(minute.minuteMs, window.from.getTime());
  }
  return from === null ? null : { from: new Date(from), to };
}

/** Automatic processing is on with the embedding model these summaries used. */
async function usesCurrentEmbedding(
  projectId: string,
  embeddingConfig: TopicEmbeddingConfig,
) {
  const models = (await getEnabledTopicsModels([projectId])).get(projectId);
  return (
    models !== undefined &&
    models.embedding.model === embeddingConfig.embeddingModel &&
    models.embedding.dimensions === embeddingConfig.embeddingDimensions
  );
}

/** The rule has a map or fit, finished or in progress, for this or a newer facet version. */
async function hasMapOrFit(
  projectId: string,
  facet: TopicFacetRef,
  ruleId: string | undefined,
) {
  const run = await prisma.topicClusteringRun.findFirst({
    where: {
      ...(ruleId ? await topicRuleRunWhere(projectId, ruleId) : {}),
      projectId,
      facetId: facet.facetId,
      facetVersion: { gte: facet.version },
      status: { in: ["pending", "running", "completed"] },
    },
    select: { id: true },
  });
  return run !== null;
}
