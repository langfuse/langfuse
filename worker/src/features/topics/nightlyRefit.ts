import { createHash } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { InvalidRequestError } from "@langfuse/shared";
import { logger, recordIncrement, redis } from "@langfuse/shared/src/server";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getEnabledTopicsModels,
  getTopicClusteringSummaryStats,
  getTopicProcessingMapIds,
  listTopicFacets,
  listTopicRules,
  readTopicExecutionForRequest,
  TOPICS_SYSTEM_USER_ID,
} from "@langfuse/shared/topics/server";
import {
  topicTimeRangeSchema,
  type TopicEmbeddingConfig,
  type TopicFacetRef,
} from "@langfuse/shared/topics";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import { selectDiscoveryWindow } from "./topicsAutomation";

const DAY_MS = 86_400_000;
const NEW_SUMMARY_LOOKBACK_MS = 7 * DAY_MS;
// Bounds the burst after a deploy or outage, when every project's slot is due at once.
const MAX_REFITS_PER_TICK = 5;

/**
 * The latest daily refit time at or before `now`: the configured UTC hour plus
 * a stable per-project offset within the spread window, so projects in one
 * deployment do not all refit at the same moment.
 */
export function nightlyRefitSlot(
  projectId: string,
  now: Date,
  settings: { hourUtc: number; spreadMinutes: number },
): Date {
  const offsetMinutes =
    createHash("sha256").update(projectId).digest().readUInt32BE(0) %
    settings.spreadMinutes;
  let slot =
    Math.floor(now.getTime() / DAY_MS) * DAY_MS +
    settings.hourUtc * 3_600_000 +
    offsetMinutes * 60_000;
  while (slot > now.getTime()) slot -= DAY_MS;
  return new Date(slot);
}

/**
 * Starts one update per published map whose project's slot has not been
 * handled yet, through the same update path as the manual button. A slot runs
 * at most once: its request ID is derived from the slot, and a skipped slot is
 * remembered until the next one. After downtime, only the latest slot runs.
 */
export async function scheduleNightlyTopicRefits(
  now: Date,
  onProgress: () => Promise<void> = async () => {},
): Promise<number> {
  const settings = {
    hourUtc: env.LANGFUSE_TOPICS_NIGHTLY_REFIT_HOUR_UTC,
    spreadMinutes: env.LANGFUSE_TOPICS_NIGHTLY_REFIT_SPREAD_MINUTES,
  };
  const projects = [
    ...(
      await getEnabledTopicsModels(
        sharedEnv.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS,
      )
    ).values(),
  ]
    .map((models) => ({
      projectId: models.projectId,
      embeddingConfig: {
        embeddingModel: models.embedding.model,
        embeddingDimensions: models.embedding.dimensions,
      },
      slot: nightlyRefitSlot(models.projectId, now, settings),
    }))
    .sort((a, b) => a.slot.getTime() - b.slot.getTime());
  let started = 0;
  for (const project of projects) {
    for (const map of await servingMaps(
      project.projectId,
      project.embeddingConfig,
    )) {
      if (started >= MAX_REFITS_PER_TICK) return started;
      await onProgress();
      if (await refitMap({ ...project, ...map, now })) started++;
    }
  }
  return started;
}

/** Published maps of the Topics rule's current facet versions and embedding model. */
async function servingMaps(
  projectId: string,
  embeddingConfig: TopicEmbeddingConfig,
) {
  const [rule] = await listTopicRules(projectId);
  if (!rule) return [];
  const facets = (await listTopicFacets(projectId)).flatMap((facet) => {
    const version = facet.versions[0];
    return version && rule.facetIds.includes(facet.id)
      ? [{ facetId: facet.id, version: version.version }]
      : [];
  });
  return (
    await getTopicProcessingMapIds(projectId, facets, embeddingConfig)
  ).flatMap(({ facetId, facetVersion, runId }) =>
    runId ? [{ facet: { facetId, version: facetVersion }, runId }] : [],
  );
}

async function refitMap({
  projectId,
  embeddingConfig,
  slot,
  facet,
  runId,
  now,
}: {
  projectId: string;
  embeddingConfig: TopicEmbeddingConfig;
  slot: Date;
  facet: TopicFacetRef;
  runId: string;
  now: Date;
}): Promise<boolean> {
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify(["nightly-refit", facet, embeddingConfig, slot.getTime()]),
    )
    .digest("hex");
  const requestId = `nightly-refit-${requestHash.slice(0, 48)}`;
  const existing = await readTopicExecutionForRequest(
    projectId,
    requestId,
    requestHash,
  );
  if (existing) {
    // Recovers an execution whose queue job was lost before it started.
    if (existing.status === "queued")
      await enqueueTopicExecution(projectId, existing.id);
    return false;
  }
  const skipKey = `langfuse:topics:nightly-refit:skipped:${projectId}:${requestId}`;
  if (redis && (await redis.exists(skipKey))) return false;
  // Rechecked on the next tick, so a refit follows a fit that is still running.
  if (await fitInProgress(projectId, facet)) return false;
  const timeRange = (await hasNewSummaries(
    projectId,
    facet,
    embeddingConfig,
    runId,
    now,
  ))
    ? await selectDiscoveryWindow(projectId, facet, embeddingConfig)
    : null;
  if (!timeRange) {
    await redis?.set(skipKey, "1", "EX", DAY_MS / 1000);
    recordIncrement("langfuse.topics.nightly_refits", 1, {
      outcome: "skipped",
    });
    return false;
  }
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
      },
      requestHash,
      TOPICS_SYSTEM_USER_ID,
    );
  } catch (error) {
    // Another worker created this slot's execution first.
    if (error instanceof InvalidRequestError) return false;
    throw error;
  }
  if (execution.status === "queued")
    await enqueueTopicExecution(projectId, execution.id);
  recordIncrement("langfuse.topics.nightly_refits", 1, { outcome: "started" });
  logger.info("Started nightly Topics refit", {
    projectId,
    facetId: facet.facetId,
    facetVersion: facet.version,
    slot: slot.toISOString(),
  });
  return true;
}

async function fitInProgress(projectId: string, facet: TopicFacetRef) {
  const run = await prisma.topicClusteringRun.findFirst({
    where: {
      projectId,
      facetId: facet.facetId,
      facetVersion: { gte: facet.version },
      status: { in: ["pending", "running"] },
    },
    select: { id: true },
  });
  return run !== null;
}

/** Whether summaries of traces newer than the published map's window exist. */
async function hasNewSummaries(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
  runId: string,
  now: Date,
) {
  const run = await prisma.topicClusteringRun.findFirst({
    where: { projectId, id: runId },
    select: { config: true },
  });
  const previous = topicTimeRangeSchema.safeParse(
    (run?.config as Record<string, unknown> | null)?.timeRange,
  );
  const from = Math.max(
    previous.success ? previous.data.to.getTime() : 0,
    now.getTime() - NEW_SUMMARY_LOOKBACK_MS,
  );
  if (from >= now.getTime()) return false;
  const { count } = await getTopicClusteringSummaryStats(
    projectId,
    facet.facetId,
    facet.version,
    embeddingConfig,
    { from: new Date(from), to: now },
    {
      maxRows: env.LANGFUSE_TOPICS_MAX_CLUSTERING_ROWS,
      maxBytes: env.LANGFUSE_TOPICS_MAX_CLUSTERING_BYTES,
    },
  );
  return count > 0;
}

export class TopicsNightlyRefitRunner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return 5 * 60_000;
  }

  constructor() {
    super({
      name: "TopicsNightlyRefitRunner",
      metricName: "topics_nightly_refit",
      lockKey: "langfuse:topics-nightly-refit",
      lockTtlSeconds: 300,
      onUnavailable: "fail",
    });
  }

  protected async execute(): Promise<void> {
    await this.withLock(() =>
      scheduleNightlyTopicRefits(new Date(), () => this.extendLockOnProgress()),
    );
  }
}
