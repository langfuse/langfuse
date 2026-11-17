import { createHash } from "node:crypto";
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
  getTopicSetupSummaryCounts,
  isTopicRuleSetupActive,
  isTopicsProjectEnabled,
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
  TopicRun,
} from "@langfuse/shared/topics";
import { resolveTraceIdleMs } from "../traceBatching/traceBatchReadiness";
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
// Spreads seeded dispatch so up to SETUP_TRACES summaries do not hit the LLM at once.
const SEED_SPREAD_MS = 60_000;
// Summaries date from a trace's first event, which can precede the window.
const SPAN_MARGIN_MS = 5 * 60_000;
// Fails visibly before the setup keys expire after an hour.
const MAX_SETUP_MS = 50 * 60_000;
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

/** Where fits and progress counts start; earlier than the window when a seeded trace started before it. */
const fitFrom = (setup: TopicRuleSetup, now: Date) =>
  setup.from
    ? new Date(setup.from)
    : setupWindow(setup, setup.days ?? TOPIC_SETUP_WINDOW_DAYS[0], now).from;

const isFinished = (status: TopicRun["status"] | null) =>
  status === "completed" || status === "failed" || status === "skipped";

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
    else if (setup.phase === "summarizing") await followRuns(setup);
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
  if (!isTopicsProjectEnabled(setup.projectId))
    throw new SetupStopped("Topics is not enabled for this project.");
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
    const counts = await getTopicSetupSummaryCounts(
      projectId,
      facetRefs(open),
      embeddingConfig,
      window,
      matching,
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
  const windowFrom = setupWindow(
    setup,
    setup.days ?? TOPIC_SETUP_WINDOW_DAYS[0],
    now,
  ).from;
  setup.from = windowFrom.toISOString();
  if (seeded.length) {
    await writeTopicRuleSetupTraces(setup, seeded);
    const bounds = await getTopicSetupTraceBounds({
      projectId,
      traceIds: seeded,
      from: windowFrom,
    });
    setup.from = new Date(
      Math.min(windowFrom.getTime(), ...bounds.map(({ minStart }) => minStart)),
    ).toISOString();
    // Seeded traces summarized before for a facet are summarized again; count them once.
    const previous = await countTopicTraceSummaries(
      projectId,
      facetRefs(open),
      embeddingConfig,
      seeded,
      new Date(0),
      fitFrom(setup, now),
    );
    for (const facet of open)
      facet.existingCount = Math.max(
        0,
        facet.existingCount -
          (previous.find(({ facetId }) => facetId === facet.facetId)
            ?.complete ?? 0),
      );
    await seedTraceDispatch(
      projectId,
      bounds,
      [rule.id],
      SEED_DELAY_MS,
      SEED_SPREAD_MS,
    );
  }
  setup.seededCount = seeded.length;
  for (const facet of open)
    if (facet.state === "covered")
      await startFit(setup, facet, { rule, embeddingConfig }, now);
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
  context: SetupContext,
  now: Date,
) {
  const waiting = setup.facets.filter(
    (facet) => facet.state === "short" && !facet.runId,
  );
  if (waiting.length) {
    const counts = await countTopicTraceSummaries(
      setup.projectId,
      facetRefs(waiting),
      context.embeddingConfig,
      await readTopicRuleSetupTraces(setup.projectId, setup.ruleId),
      new Date(setup.startedAt),
      fitFrom(setup, now),
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
        await startFit(setup, facet, context, now);
    }
  }
  if (setup.facets.every((facet) => facet.state === "has_map" || facet.runId))
    setup.phase = "fitting";
}

/**
 * One pending rule-owned run, as the nightly refit creates, on the queue ahead of
 * nightly fits. Its ID derives from the setup, so a retried tick reuses it.
 */
async function startFit(
  setup: TopicRuleSetup,
  facet: TopicRuleSetupFacet,
  { embeddingConfig }: SetupContext,
  now: Date,
) {
  const ref = { facetId: facet.facetId, version: facet.facetVersion };
  const id = createHash("sha256")
    .update(
      JSON.stringify([
        "rule-setup",
        setup.ruleId,
        ref,
        embeddingConfig,
        setup.startedAt,
      ]),
    )
    .digest("hex")
    .slice(0, 48);
  const run = (await getTopicRun(setup.projectId, id)) ?? (await createFit());
  facet.fit = run.config.exploratory === true ? "small_sample" : "standard";
  facet.runId = run.id;
  facet.runStatus = run.status;
  if (run.status === "pending")
    await enqueueTopicRuleRefit(setup.projectId, run.id);

  async function createFit() {
    const smallSample =
      facet.existingCount + facet.completeCount < STANDARD_FIT_MINIMUM;
    return createTopicRun({
      id,
      projectId: setup.projectId,
      facetId: facet.facetId,
      facetVersion: facet.facetVersion,
      ruleId: setup.ruleId,
      config: {
        embeddingModel: embeddingConfig.embeddingModel,
        dimensions: embeddingConfig.embeddingDimensions,
        // The fit loads the newest of the rule's summaries in this window.
        timeRange: {
          from: fitFrom(setup, now).toISOString(),
          to: now.toISOString(),
        },
        ...(smallSample ? { exploratory: true } : {}),
        // The nightly refit then picks up seeded summaries that finish later.
        ...(smallSample ||
        (facet.state === "short" && facet.settledCount < setup.seededCount)
          ? { provisional: true }
          : {}),
      },
    });
  }
}

/** Copies each fit's status; re-enqueues a pending one, whose job may have been lost. */
async function followRuns(setup: TopicRuleSetup) {
  const runs = new Map<string, TopicRun | null>();
  for (const facet of setup.facets) {
    if (!facet.runId) continue;
    const run = await getTopicRun(setup.projectId, facet.runId);
    runs.set(facet.runId, run);
    facet.runStatus = run?.status ?? "failed";
    // The job ID is the run ID, so this adds nothing while the job exists.
    if (run?.status === "pending")
      await enqueueTopicRuleRefit(setup.projectId, run.id);
  }
  return runs;
}

/**
 * Done once every fit finished. Failed only when no fit completed and one
 * failed; skipped fits had too few traces, which a retry cannot change.
 */
async function followFits(setup: TopicRuleSetup, now: Date) {
  const runs = await followRuns(setup);
  const fits = setup.facets.filter((facet) => facet.runId);
  if (fits.every((facet) => isFinished(facet.runStatus))) {
    const failed = fits.find((facet) => facet.runStatus === "failed");
    if (failed && !fits.some((facet) => facet.runStatus === "completed")) {
      setup.phase = "failed";
      setup.error =
        runs.get(failed.runId!)?.error ??
        "The first topics could not be built.";
    } else setup.phase = "done";
  } else if (now.getTime() - Date.parse(setup.startedAt) > MAX_SETUP_MS) {
    setup.phase = "failed";
    setup.error = "The first topics did not finish in time.";
  }
}
