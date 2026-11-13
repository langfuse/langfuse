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
  isTopicRuleSetupActive,
  listTopicFacets,
  listTopicRules,
  readTopicRuleSetup,
} from "@langfuse/shared/topics/server";
import {
  TOPICS_MAX_SELECTION_RANGE_MS,
  TOPICS_MAX_TIME_RANGE_MS,
  topicTimeRangeSchema,
  type TopicEmbeddingConfig,
  type TopicFacetRef,
  type TopicRun,
} from "@langfuse/shared/topics";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const DAY_MS = 86_400_000;
const RECENT_FIT_MS = 3_600_000;
// Bounds the burst after a deploy or outage, when every project's slot is due at once.
const MAX_REFITS_PER_TICK = 5;
// Projects refit at a stable offset within this many minutes after the hour.
const REFIT_SPREAD_MINUTES = 30;
// Nightly fits queue behind unprioritized jobs, such as a setup's first fit.
const NIGHTLY_REFIT_PRIORITY = 10;

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
      // Replacing open runs below would fail the setup's fit.
      if (
        isTopicRuleSetupActive(
          await readTopicRuleSetup(project.projectId, rule.id),
        )
      )
        continue;
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
      await enqueueTopicRuleRefit(projectId, runId, NIGHTLY_REFIT_PRIORITY);
    return false;
  }
  // A fit started from an hour before the slot on, such as a manual refresh, stands in for this slot's fit.
  const recent = await prisma.topicClusteringRun.findFirst({
    where: {
      projectId,
      ruleId,
      facetId: facet.facetId,
      status: { in: ["pending", "running", "completed"] },
      createdAt: { gte: new Date(slot.getTime() - RECENT_FIT_MS) },
    },
    select: { id: true },
  });
  if (recent) return false;
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
  const previous = await currentRuleMap(
    projectId,
    ruleId,
    facet,
    embeddingConfig,
  );
  // A provisional map misses summaries that finished after its fit, inside its window.
  if (
    previous &&
    !previous.config.provisional &&
    !(await hasNewSummaries(projectId, facet, embeddingConfig, previous, now))
  ) {
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
      // The fit loads the newest of the rule's summaries in this window.
      timeRange: {
        from: new Date(
          now.getTime() - TOPICS_MAX_SELECTION_RANGE_MS,
        ).toISOString(),
        to: now.toISOString(),
      },
    },
  });
  await enqueueTopicRuleRefit(projectId, runId, NIGHTLY_REFIT_PRIORITY);
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

/** The rule's map of this facet version and embedding, which a refit continues. */
export async function currentRuleMap(
  projectId: string,
  ruleId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
): Promise<TopicRun | null> {
  const current = await getTopicRuleMap(projectId, ruleId, facet.facetId);
  return current?.facetVersion === facet.version &&
    current.config.embeddingModel === embeddingConfig.embeddingModel &&
    current.config.dimensions === embeddingConfig.embeddingDimensions
    ? current
    : null;
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
