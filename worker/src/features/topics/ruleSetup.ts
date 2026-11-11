import { prisma } from "@langfuse/shared/src/db";
import {
  getTopicSetupTraceBounds,
  getTopicSetupTraceIds,
  logger,
  recordDistribution,
  recordIncrement,
  TOPIC_SETUP_WINDOW_DAYS,
} from "@langfuse/shared/src/server";
import {
  countTopicTraceSummaries,
  createTopicRun,
  enqueueTopicRuleRefit,
  getEnabledTopicsModels,
  getTopicRule,
  getTopicRun,
  getTopicSummaryCounts,
  isTopicRuleSetupActive,
  listTopicFacets,
  readTopicRuleSetup,
  readTopicRuleSetupTraces,
  topicMatchingTraceIdsQuery,
  writeTopicRuleSetup,
  writeTopicRuleSetupTraces,
  type TopicRuleSetup,
  type TopicRuleSetupFacet,
} from "@langfuse/shared/topics/server";
import type {
  TopicEmbeddingConfig,
  TopicFacetRef,
  TopicRule,
} from "@langfuse/shared/topics";
import { resolveTraceIdleMs } from "../traceBatching/traceBatchReadiness";
import { isTraceDispatchEnabled } from "../traceBatching/traceBatchSampling";
import { seedTraceDispatch } from "../traceBatching/traceRuleRecording";
import { currentRuleMap } from "./nightlyRefit";

export const TOPIC_RULE_SETUP_TICK_MS = 15_000;
const DAY_MS = 86_400_000;
const ENOUGH_SUMMARIES = 400;
const SETUP_TRACES = 500;
const SETTLED_SHARE = 0.9;
const STALL_MS = 60_000;
const STANDARD_FIT_MINIMUM = 100;
// Events-dispatch caches a project's rules for 15 s; earlier, a pod may drop the new rule.
const SEED_DELAY_MS = 20_000;
// Summaries date from a trace's first event, which can precede the window.
const SPAN_MARGIN_MS = 5 * 60_000;
const MAX_SETUP_MS = 60 * 60_000;
// A ClickHouse timeout or a Redis blip retries on the next tick before the setup fails.
const MAX_FAILED_TICKS = 3;

/** A setup that cannot continue, whatever the next tick brings. */
class SetupStopped extends Error {}

type SetupContext = {
  rule: TopicRule;
  embeddingConfig: TopicEmbeddingConfig;
};

const facetRefs = (facets: TopicRuleSetupFacet[]): TopicFacetRef[] =>
  facets.map(({ facetId, facetVersion }) => ({
    facetId,
    version: facetVersion,
  }));

const setupWindow = (setup: TopicRuleSetup, days: number, to: Date) => ({
  from: new Date(Date.parse(setup.startedAt) - days * DAY_MS - SPAN_MARGIN_MS),
  to,
});

/** Advances a rule's setup by one step; returns whether it is still active. */
export async function tickTopicRuleSetup(
  projectId: string,
  ruleId: string,
  now = new Date(),
): Promise<boolean> {
  const setup = await readTopicRuleSetup(projectId, ruleId);
  if (!setup || !isTopicRuleSetupActive(setup)) return false;
  try {
    const context = await setupContext(setup);
    if (setup.phase === "selecting") await selectAndSeed(setup, context, now);
    if (setup.phase === "summarizing")
      await fitSettledFacets(setup, context, now);
    if (setup.phase === "fitting") await followFits(setup, now);
    setup.failedTicks = 0;
    if (setup.phase !== "failed") setup.error = null;
  } catch (error) {
    setup.failedTicks = (setup.failedTicks ?? 0) + 1;
    setup.error = error instanceof Error ? error.message : String(error);
    if (error instanceof SetupStopped || setup.failedTicks >= MAX_FAILED_TICKS)
      setup.phase = "failed";
    logger.warn("Topics rule setup tick failed", {
      projectId,
      ruleId,
      failedTicks: setup.failedTicks,
      error,
    });
  }
  await writeTopicRuleSetup(setup);
  const active = isTopicRuleSetupActive(setup);
  if (!active) recordOutcome(setup, now);
  return active;
}

function recordOutcome(setup: TopicRuleSetup, now: Date) {
  const durationMs = now.getTime() - Date.parse(setup.startedAt);
  recordIncrement("langfuse.topics.rule_setups", 1, { outcome: setup.phase });
  recordDistribution("langfuse.topics.rule_setup_duration_ms", durationMs, {
    outcome: setup.phase,
  });
  logger.info("Finished Topics rule setup", {
    projectId: setup.projectId,
    ruleId: setup.ruleId,
    outcome: setup.phase,
    error: setup.error,
    durationMs,
    days: setup.days,
    seeded: setup.seededCount,
    facets: setup.facets.map((facet) => ({
      facetId: facet.facetId,
      state: facet.state,
      existing: facet.existingCount,
      settled: facet.settledCount,
      fit: facet.fit,
      runStatus: facet.runStatus,
    })),
  });
}

async function setupContext(setup: TopicRuleSetup): Promise<SetupContext> {
  const [rule, models] = await Promise.all([
    getTopicRule(setup.projectId, setup.ruleId),
    getEnabledTopicsModels([setup.projectId]),
  ]);
  if (!rule || rule.enabled === false)
    throw new SetupStopped("The rule was paused or deleted.");
  const project = models.get(setup.projectId);
  if (!project) throw new SetupStopped("Automatic processing is off.");
  return {
    rule,
    embeddingConfig: {
      embeddingModel: project.embedding.model,
      embeddingDimensions: project.embedding.dimensions,
    },
  };
}

/**
 * Reuses the rule's maps and existing summaries; seeds only the shortfall into
 * trace dispatch, widening the window until enough traces are found.
 */
async function selectAndSeed(
  setup: TopicRuleSetup,
  { rule, embeddingConfig }: SetupContext,
  now: Date,
) {
  const { projectId } = setup;
  const facets = (await listTopicFacets(projectId)).flatMap((facet) => {
    const version = facet.versions[0]?.version;
    return version && rule.facetIds.includes(facet.id)
      ? [{ facetId: facet.id, version }]
      : [];
  });
  setup.facets = await Promise.all(
    facets.map(async (facet) => ({
      facetId: facet.facetId,
      facetVersion: facet.version,
      state: (await currentRuleMap(projectId, rule.id, facet, embeddingConfig))
        ? ("has_map" as const)
        : ("short" as const),
      existingCount: 0,
      settledCount: 0,
      completeCount: 0,
      grewAt: null,
      fit: null,
      runId: null,
      runStatus: null,
    })),
  );
  const open = setup.facets.filter((facet) => facet.state !== "has_map");
  let seeded: string[] = [];
  for (const days of open.length ? TOPIC_SETUP_WINDOW_DAYS : []) {
    setup.days = days;
    const window = setupWindow(setup, days, now);
    const matching = rule.filter.length
      ? await topicMatchingTraceIdsQuery(
          { projectId, filter: rule.filter, ...window },
          prisma,
        )
      : undefined;
    if (matching === null) continue;
    const counts = await getTopicSummaryCounts(
      projectId,
      facetRefs(open),
      embeddingConfig,
      window,
      matching ? { traces: matching } : undefined,
    );
    for (const facet of open)
      facet.existingCount =
        counts.find(({ facetId }) => facetId === facet.facetId)?.count ?? 0;
    const fewest = Math.min(...open.map((facet) => facet.existingCount));
    if (fewest >= ENOUGH_SUMMARIES) {
      seeded = [];
      break;
    }
    const shortfall = SETUP_TRACES - fewest;
    // Without trace dispatch nothing would pick seeds up; fit what exists.
    if (!isTraceDispatchEnabled()) continue;
    // Every unsummarized match up to the shortfall; a random sample of it beyond.
    seeded = await getTopicSetupTraceIds({
      projectId,
      idleMs: await resolveTraceIdleMs(projectId),
      now,
      days,
      sampling: rule.sampling,
      limit: shortfall,
      seed: rule.id,
      matching,
      summarized: { facets: facetRefs(open), embeddingConfig },
    });
    if (seeded.length >= shortfall) break;
  }
  for (const facet of open)
    facet.state = facet.existingCount >= ENOUGH_SUMMARIES ? "covered" : "short";
  if (seeded.length) {
    await writeTopicRuleSetupTraces(projectId, rule.id, seeded);
    const bounds = await getTopicSetupTraceBounds({
      projectId,
      traceIds: seeded,
      from: setupWindow(setup, setup.days!, now).from,
    });
    await seedTraceDispatch(projectId, bounds, [rule.id], SEED_DELAY_MS);
  }
  setup.seededCount = seeded.length;
  for (const facet of open)
    if (facet.state === "covered")
      await startFit(setup, facet, embeddingConfig, now);
  setup.phase = "summarizing";
  logger.info("Started Topics rule setup", {
    projectId,
    ruleId: rule.id,
    days: setup.days,
    seeded: seeded.length,
    facets: setup.facets.map(({ facetId, state, existingCount }) => ({
      facetId,
      state,
      existingCount,
    })),
  });
}

/** Fits each short facet once most seeded traces settled, its count stalled, or the deadline passed. */
async function fitSettledFacets(
  setup: TopicRuleSetup,
  { embeddingConfig }: SetupContext,
  now: Date,
) {
  const waiting = setup.facets.filter(
    (facet) => facet.state === "short" && !facet.runId,
  );
  if (waiting.length) {
    const counts = await countTopicTraceSummaries(
      setup.projectId,
      facetRefs(waiting),
      embeddingConfig,
      await readTopicRuleSetupTraces(setup.projectId, setup.ruleId),
      new Date(setup.startedAt),
      setupWindow(setup, setup.days ?? TOPIC_SETUP_WINDOW_DAYS[0], now).from,
    );
    for (const facet of waiting) {
      const count = counts.find(({ facetId }) => facetId === facet.facetId)!;
      if (count.settled > facet.settledCount) facet.grewAt = now.toISOString();
      facet.settledCount = count.settled;
      facet.completeCount = count.complete;
      const settled = facet.settledCount >= SETTLED_SHARE * setup.seededCount;
      // Measured from the first summary on, since seeds dispatch only after a delay.
      const stalled =
        facet.grewAt !== null &&
        now.getTime() - Date.parse(facet.grewAt) >= STALL_MS &&
        facet.existingCount + facet.completeCount >= STANDARD_FIT_MINIMUM;
      if (settled || stalled || now >= new Date(setup.deadlineAt))
        await startFit(setup, facet, embeddingConfig, now);
    }
  }
  if (setup.facets.every((facet) => facet.state === "has_map" || facet.runId))
    setup.phase = "fitting";
}

/** One pending rule-owned run, as the nightly refit creates, on the queue ahead of nightly fits. */
async function startFit(
  setup: TopicRuleSetup,
  facet: TopicRuleSetupFacet,
  embeddingConfig: TopicEmbeddingConfig,
  now: Date,
) {
  const smallSample =
    facet.existingCount + facet.completeCount < STANDARD_FIT_MINIMUM;
  const window = setupWindow(
    setup,
    setup.days ?? TOPIC_SETUP_WINDOW_DAYS[0],
    now,
  );
  const run = await createTopicRun({
    projectId: setup.projectId,
    facetId: facet.facetId,
    facetVersion: facet.facetVersion,
    ruleId: setup.ruleId,
    config: {
      embeddingModel: embeddingConfig.embeddingModel,
      dimensions: embeddingConfig.embeddingDimensions,
      timeRange: {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
      },
      ...(smallSample ? { exploratory: true } : {}),
      // The nightly refit then picks up seeded summaries that finish later.
      ...(smallSample ||
      (facet.state === "short" && facet.settledCount < setup.seededCount)
        ? { provisional: true }
        : {}),
    },
  });
  facet.fit = smallSample ? "small_sample" : "standard";
  facet.runId = run.id;
  facet.runStatus = run.status;
  await enqueueTopicRuleRefit(setup.projectId, run.id);
}

async function followFits(setup: TopicRuleSetup, now: Date) {
  for (const facet of setup.facets)
    if (facet.runId)
      facet.runStatus =
        (await getTopicRun(setup.projectId, facet.runId))?.status ?? "failed";
  if (
    setup.facets.every(
      (facet) =>
        !facet.runId ||
        facet.runStatus === "completed" ||
        facet.runStatus === "failed" ||
        facet.runStatus === "skipped",
    )
  )
    setup.phase = "done";
  else if (now.getTime() - Date.parse(setup.startedAt) > MAX_SETUP_MS) {
    setup.phase = "failed";
    setup.error = "The first topics did not finish within an hour.";
  }
}
