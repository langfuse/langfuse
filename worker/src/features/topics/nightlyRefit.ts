import { createHash } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { logger, recordIncrement } from "@langfuse/shared/src/server";
import {
  createTopicRun,
  enqueueTopicRuleRefit,
  getEnabledTopicsModels,
  getTopicClusteringSummaryStats,
  getTopicRuleMap,
  listTopicFacets,
  listTopicRules,
  TOPIC_CLUSTERING_CAPACITY_ERROR,
} from "@langfuse/shared/topics/server";
import {
  TOPICS_MAX_TIME_RANGE_MS,
  topicTimeRangeSchema,
  type TopicEmbeddingConfig,
  type TopicFacetRef,
  type TopicRun,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import { topicClusterSettings } from "./numeric";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
// Bounds the burst after a deploy or outage, when every project's slot is due at once.
const MAX_REFITS_PER_TICK = 5;
// Projects refit at a stable offset within this many minutes after the hour.
const REFIT_SPREAD_MINUTES = 30;

/**
 * The latest daily refit time at or before `now`: the configured UTC hour plus
 * a stable per-project offset within the spread window, so projects in one
 * deployment do not all refit at the same moment.
 */
export function nightlyRefitSlot(
  projectId: string,
  now: Date,
  hourUtc: number,
): Date {
  const offsetMinutes =
    createHash("sha256").update(projectId).digest().readUInt32BE(0) %
    REFIT_SPREAD_MINUTES;
  let slot =
    Math.floor(now.getTime() / DAY_MS) * DAY_MS +
    hourUtc * 3_600_000 +
    offsetMinutes * 60_000;
  while (slot > now.getTime()) slot -= DAY_MS;
  return new Date(slot);
}

/**
 * Fits every active rule's map of each of its facets once per slot. Each fit is one
 * run row with the rule's ID, whose ID derives from the slot, so a slot is
 * handled at most once; a slot with nothing to fit leaves a skipped run.
 * After downtime, only the latest slot runs.
 */
export async function scheduleNightlyTopicRefits(
  now: Date,
  onProgress: () => Promise<void> = async () => {},
): Promise<number> {
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
      slot: nightlyRefitSlot(
        models.projectId,
        now,
        env.LANGFUSE_TOPICS_NIGHTLY_REFIT_HOUR_UTC,
      ),
    }))
    .sort((a, b) => a.slot.getTime() - b.slot.getTime());
  let started = 0;
  for (const project of projects) {
    const facets = await listTopicFacets(project.projectId);
    for (const rule of await listTopicRules(project.projectId, {
      activeOnly: true,
    })) {
      // A rule saved after its slot is first fitted at the next slot, once its backfill ran.
      if (new Date(rule.updatedAt) > project.slot) continue;
      for (const facet of facets) {
        const version = facet.versions[0]?.version;
        if (!version || !rule.facetIds.includes(facet.id)) continue;
        if (started >= MAX_REFITS_PER_TICK) return started;
        await onProgress();
        try {
          if (
            await refitRuleFacet({
              ...project,
              ruleId: rule.id,
              facet: { facetId: facet.id, version },
              now,
            })
          )
            started++;
        } catch (error) {
          // One failing project must not block the projects after it.
          recordIncrement("langfuse.topics.nightly_refits", 1, {
            outcome: "failed",
          });
          logger.error("Failed to schedule nightly Topics refit", {
            projectId: project.projectId,
            ruleId: rule.id,
            facetId: facet.id,
            error,
          });
        }
      }
    }
  }
  return started;
}

async function refitRuleFacet({
  projectId,
  embeddingConfig,
  slot,
  ruleId,
  facet,
  now,
}: {
  projectId: string;
  embeddingConfig: TopicEmbeddingConfig;
  slot: Date;
  ruleId: string;
  facet: TopicFacetRef;
  now: Date;
}): Promise<boolean> {
  const runId = createHash("sha256")
    .update(
      JSON.stringify([
        "rule-refit",
        ruleId,
        facet,
        embeddingConfig,
        slot.getTime(),
      ]),
    )
    .digest("hex")
    .slice(0, 48);
  const existing = await prisma.topicClusteringRun.findFirst({
    where: { projectId, id: runId },
    select: { status: true },
  });
  if (existing) {
    // Recovers a run whose queue job was lost before it started.
    if (existing.status === "pending")
      await enqueueTopicRuleRefit(projectId, runId);
    return false;
  }
  // A fit still open from an earlier slot was interrupted; this slot replaces it.
  await prisma.topicClusteringRun.updateMany({
    where: {
      projectId,
      ruleId,
      facetId: facet.facetId,
      status: { in: ["pending", "running"] },
    },
    data: {
      status: "failed",
      error: "Replaced by the next nightly refit.",
      finishedAt: now,
    },
  });
  const run = {
    id: runId,
    projectId,
    facetId: facet.facetId,
    facetVersion: facet.version,
    ruleId,
  };
  const embedding = {
    embeddingModel: embeddingConfig.embeddingModel,
    dimensions: embeddingConfig.embeddingDimensions,
  };
  const current = await getTopicRuleMap(projectId, ruleId, facet.facetId);
  const previous =
    current?.facetVersion === facet.version &&
    current.config.embeddingModel === embedding.embeddingModel &&
    current.config.dimensions === embedding.dimensions
      ? current
      : null;
  const timeRange =
    previous &&
    !(await hasNewSummaries(projectId, facet, embeddingConfig, previous, now))
      ? null
      : await selectFitWindow(
          projectId,
          facet,
          embeddingConfig,
          now,
          await capacityFailedWindow(projectId, ruleId, facet),
        );
  if (!timeRange) {
    await createTopicRun({ ...run, status: "skipped", config: embedding });
    recordIncrement("langfuse.topics.nightly_refits", 1, {
      outcome: "skipped",
    });
    return false;
  }
  await createTopicRun({
    ...run,
    config: {
      ...embedding,
      timeRange: {
        from: timeRange.from.toISOString(),
        to: timeRange.to.toISOString(),
      },
    },
  });
  await enqueueTopicRuleRefit(projectId, runId);
  recordIncrement("langfuse.topics.nightly_refits", 1, { outcome: "started" });
  logger.info("Started nightly Topics refit", {
    projectId,
    ruleId,
    runId,
    facetId: facet.facetId,
    facetVersion: facet.version,
    firstMap: previous === null,
  });
  return true;
}

/** Whether summaries of traces newer than the published map's window exist. */
async function hasNewSummaries(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
  previous: TopicRun,
  now: Date,
) {
  const window = topicTimeRangeSchema.safeParse(previous.config.timeRange);
  const from = Math.max(
    window.success ? window.data.to.getTime() : 0,
    now.getTime() - TOPICS_MAX_TIME_RANGE_MS,
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

/** The window of the rule's last fit of this facet, if it exceeded capacity. */
async function capacityFailedWindow(
  projectId: string,
  ruleId: string,
  facet: TopicFacetRef,
) {
  const last = await prisma.topicClusteringRun.findFirst({
    where: {
      projectId,
      ruleId,
      facetId: facet.facetId,
      facetVersion: facet.version,
      status: { in: ["completed", "failed"] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { status: true, error: true, config: true },
  });
  if (
    last?.status !== "failed" ||
    last.error !== TOPIC_CLUSTERING_CAPACITY_ERROR
  )
    return undefined;
  return topicTimeRangeSchema.safeParse(
    (last.config as Record<string, unknown>).timeRange,
  ).data;
}

/**
 * The longest recent window, up to the Topics maximum and to the hour, whose
 * cohort fits the worker's capacity; only aggregate counts and byte estimates
 * are loaded. After a capacity failure, the search starts from half that window.
 */
async function selectFitWindow(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
  to: Date,
  failedWindow?: TopicTimeRange,
): Promise<TopicTimeRange | null> {
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
  // Window lengths in hours: `longest` is the upper bound, `fitting` the best found.
  let longest = Math.floor(
    (failedWindow
      ? Math.min(
          TOPICS_MAX_TIME_RANGE_MS,
          (failedWindow.to.getTime() - failedWindow.from.getTime()) / 2,
        )
      : TOPICS_MAX_TIME_RANGE_MS) / HOUR_MS,
  );
  let shortest = 1;
  let fitting: number | null = null;
  // The first check is the whole window, which usually fits.
  let hours = longest;
  while (shortest <= longest) {
    const { count, bytes } = await getTopicClusteringSummaryStats(
      projectId,
      facet.facetId,
      facet.version,
      embeddingConfig,
      { from: new Date(to.getTime() - hours * HOUR_MS), to },
      limits,
    );
    if (count > limits.maxRows || bytes > limits.maxBytes) {
      longest = hours - 1;
    } else {
      // Shorter windows hold fewer summaries, so a fit or a shortfall rules them out.
      if (count >= minimumCount) fitting = hours;
      shortest = hours + 1;
    }
    hours = Math.floor((shortest + longest) / 2);
  }
  return fitting === null
    ? null
    : { from: new Date(to.getTime() - fitting * HOUR_MS), to };
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
