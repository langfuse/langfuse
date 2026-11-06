import { ZodError } from "zod";
import {
  createTraceBatchInputStorage,
  logger,
  recordIncrement,
  type TopicsTraceEventType,
  type TraceBatchInputData,
} from "@langfuse/shared/src/server";
import {
  getEnabledTopicsModels,
  isTopicsProjectEnabled,
  isValidTopicSummary,
  listTopicFacets,
  listTopicRules,
  topicAssignmentRecord,
  topicSummaryRecord,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import type {
  TopicFacet,
  TopicRule,
  TopicSummary,
} from "@langfuse/shared/topics";
import { ClickhouseWriter, TableName } from "../../services/ClickhouseWriter";
import { topicAssignmentRows } from "./assignments";
import { TopicInputTooLarge } from "./models";
import {
  isRejectedConnection,
  pauseForRejectedConnection,
  TopicsProviderUnavailable,
} from "./provider-error";
import { getServingTopicRun } from "./servingRuns";
import {
  summarizeAssembledTrace,
  type TopicsFailedStage,
} from "./summarizeAssembledTrace";
import { signalTopicsDiscovery } from "./topicsAutomation";

const inputStorage = createTraceBatchInputStorage();

export type TopicsTraceOutcome =
  | { outcome: "disabled" | "stale" | "summarized" }
  | { outcome: "retry_scheduled"; failedStage: TopicsFailedStage }
  | { outcome: "failed"; reason: string; failedStage?: TopicsFailedStage };

export type TopicsTraceDeps = {
  /** Requeues the event restricted to these facets. */
  scheduleRetry: (
    facetIds: string[],
  ) => Promise<"scheduled" | "skipped" | "queue_unavailable">;
  /** Retry attempt of this job; 0 or absent on the first attempt. */
  attempt?: number;
};

// Bounds Postgres reads per trace; a pause on another pod takes effect within this window.
const SETTINGS_TTL_MS = 15_000;
const MAX_SETTINGS_KEYS = 10_000;
type ProjectSettings = {
  models: TopicsModels | undefined;
  rules: TopicRule[];
  facets: TopicFacet[];
};
const settingsCache = new Map<
  string,
  { settings: Promise<ProjectSettings>; expiresAt: number }
>();

function projectSettings(projectId: string): Promise<ProjectSettings> {
  const now = Date.now();
  const cached = settingsCache.get(projectId);
  if (cached && cached.expiresAt > now) return cached.settings;
  if (settingsCache.size >= MAX_SETTINGS_KEYS) settingsCache.clear();
  const settings = Promise.all([
    getEnabledTopicsModels([projectId]),
    listTopicRules(projectId),
    listTopicFacets(projectId),
  ]).then(([models, rules, facets]) => ({
    models: models.get(projectId),
    rules,
    facets,
  }));
  settingsCache.set(projectId, { settings, expiresAt: now + SETTINGS_TTL_MS });
  settings.catch(() => settingsCache.delete(projectId));
  return settings;
}

/** Facets the event's rules select, in listing order; a retry restricts them to its unfinished facets. */
function selectFacets(
  event: TopicsTraceEventType,
  settings: ProjectSettings,
): TopicFacet[] {
  const ruleIds = new Set(event.ruleIds);
  const selected = new Set(
    settings.rules
      .filter((rule) => ruleIds.has(rule.id))
      .flatMap((rule) => rule.facetIds),
  );
  const pending = event.facetIds && new Set(event.facetIds);
  return settings.facets.filter(
    (facet) =>
      facet.versions.length > 0 &&
      selected.has(facet.id) &&
      (!pending || pending.has(facet.id)),
  );
}

/** Facets that still have no row, so a retry repeats only those. */
function pendingFacetIds(facets: TopicFacet[], rows: TopicSummary[]): string[] {
  const done = new Set(rows.map((row) => row.facetId));
  return facets.map((facet) => facet.id).filter((id) => !done.has(id));
}

/** Unreadable objects are retried; a stored object that does not parse never will. */
async function readInputs(
  event: TopicsTraceEventType,
): Promise<TraceBatchInputData | null> {
  try {
    return await inputStorage.get({
      projectId: event.projectId,
      traceId: event.traceId,
      revision: event.revision,
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      logger.warn("Stored Topics trace input is invalid", {
        projectId: event.projectId,
        traceId: event.traceId,
        revision: event.revision,
        error: error.message,
      });
      return null;
    }
    throw error;
  }
}

function storeSummaries(rows: TopicSummary[]): TopicSummary[] {
  const writer = ClickhouseWriter.getInstance();
  const valid = rows.filter(isValidTopicSummary);
  if (valid.length < rows.length)
    logger.warn("Topics summary rows failed validation", {
      rowCount: rows.length - valid.length,
    });
  for (const row of valid) {
    writer.addToQueue(TableName.TopicFacetSummaries, topicSummaryRecord(row));
    recordIncrement("langfuse.topics.facet_summaries", 1, {
      source: "trace_queue",
      state: row.state,
    });
  }
  return valid;
}

/**
 * Assigns each complete summary to its facet's serving map, or signals discovery
 * when none exists. A failure leaves the summary stored and unassigned rather
 * than repeating the model calls.
 */
async function assignSummaries(rows: TopicSummary[]): Promise<void> {
  const writer = ClickhouseWriter.getInstance();
  const assignedAt = new Date().toISOString();
  for (const row of rows) {
    if (row.state !== "complete" || row.traceId === null) continue;
    const facet = { facetId: row.facetId, version: row.facetVersion };
    const embeddingConfig = {
      embeddingModel: row.embeddingModel,
      embeddingDimensions: row.embedding.length,
    };
    try {
      const run = await getServingTopicRun(
        row.projectId,
        facet,
        embeddingConfig,
      );
      if (!run) {
        await signalTopicsDiscovery({ ...row, traceId: row.traceId });
        continue;
      }
      for (const assignment of topicAssignmentRows({
        projectId: row.projectId,
        facet,
        embeddingConfig,
        summaries: [row],
        run,
        origin: "online",
        assignedAt,
      }))
        writer.addToQueue(
          TableName.TopicAssignments,
          topicAssignmentRecord(assignment),
        );
    } catch (error) {
      recordIncrement("langfuse.topics.assignment_failures", 1, {
        source: "trace_queue",
      });
      logger.warn("Topics assignment failed for trace", {
        projectId: row.projectId,
        traceId: row.traceId,
        facetId: row.facetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof TopicsProviderUnavailable)) return false;
  if (error.reason === "rate_limit" || error.reason === "timeout") return true;
  return (
    error.reason === "provider_error" && (error.details.httpStatus ?? 0) >= 500
  );
}

async function processEvent(
  event: TopicsTraceEventType,
  deps: TopicsTraceDeps,
): Promise<TopicsTraceOutcome> {
  const { projectId, traceId } = event;
  if (!isTopicsProjectEnabled(projectId)) return { outcome: "disabled" };
  const settings = await projectSettings(projectId);
  const models = settings.models;
  if (!models) return { outcome: "disabled" };
  const facets = selectFacets(event, settings);
  if (facets.length === 0) return { outcome: "stale" };

  const inputs = await readInputs(event);
  if (!inputs) return { outcome: "failed", reason: "invalid_input" };

  let rows: TopicSummary[] = [];
  let failure: unknown;
  // Anything thrown before the embedding stage failed while summarizing.
  let failedStage: TopicsFailedStage = "summary";
  try {
    const result = await summarizeAssembledTrace({
      projectId,
      traceId,
      ...inputs.traceContext,
      traceName: inputs.traceContext.traceName ?? "",
      transcript: inputs.transcript,
      models,
      facets,
      attempt: deps.attempt ? "retry" : "first",
    });
    if (result.outcome === "disabled") return { outcome: "disabled" };
    rows = result.rows;
    failure = result.failure;
    failedStage = result.failedStage ?? failedStage;
  } catch (error) {
    failure = error;
  }

  const stored = storeSummaries(rows);
  await assignSummaries(stored);
  if (failure === undefined) return { outcome: "summarized" };

  const reason =
    failure instanceof TopicsProviderUnavailable ? failure.reason : "other";
  logger.warn("Topics summary failed for trace", {
    projectId,
    traceId,
    reason,
    error: failure instanceof Error ? failure.message : String(failure),
  });
  if (isRejectedConnection(failure)) {
    settingsCache.delete(projectId);
    await pauseForRejectedConnection(projectId, failure);
    return { outcome: "failed", reason, failedStage };
  }
  if (isRetryableProviderError(failure)) {
    const pending = pendingFacetIds(facets, rows);
    if (pending.length === 0) return { outcome: "failed", reason };
    const retry = await deps.scheduleRetry(pending);
    if (retry === "scheduled")
      return { outcome: "retry_scheduled", failedStage };
    // Without a scheduled retry, BullMQ's attempts are the fallback.
    if (retry === "queue_unavailable") throw failure;
    return { outcome: "failed", reason, failedStage };
  }
  if (failure instanceof TopicsProviderUnavailable)
    return { outcome: "failed", reason, failedStage };
  if (failure instanceof TopicInputTooLarge)
    return { outcome: "failed", reason: "input_too_large", failedStage };
  // Output that fails the facet schema would fail again; retrying only repeats the paid call.
  if (failure instanceof ZodError)
    return { outcome: "failed", reason: "invalid_output", failedStage };
  throw failure;
}

/**
 * Summarizes the current facets of the rules that selected one stored transcript,
 * queues the rows for ClickHouse, and assigns complete summaries to the facet's
 * serving map. Throws only for errors a later attempt can fix.
 */
export async function processTopicsTrace(
  event: TopicsTraceEventType,
  deps: TopicsTraceDeps,
): Promise<TopicsTraceOutcome> {
  const result = await processEvent(event, deps);
  recordIncrement("langfuse.topics.trace_outcomes", 1, {
    source: "trace_queue",
    outcome: result.outcome,
    attempt: deps.attempt ? "retry" : "first",
    ...(result.outcome === "failed" ? { reason: result.reason } : {}),
    ...("failedStage" in result && result.failedStage
      ? { failed_stage: result.failedStage }
      : {}),
  });
  return result;
}
