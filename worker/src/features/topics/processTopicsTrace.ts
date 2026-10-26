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
  topicAssignmentRecord,
  topicSummaryRecord,
} from "@langfuse/shared/topics/server";
import type { TopicFacetRef, TopicSummary } from "@langfuse/shared/topics";
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
  summarizeTraceFacetVersions,
  type TraceFacet,
} from "./summarizeAssembledTrace";
import { signalTopicsDiscovery } from "./topicsAutomation";

const inputStorage = createTraceBatchInputStorage();

export type TopicsTraceOutcome =
  | { outcome: "disabled" | "stale" | "summarized" | "retry_scheduled" }
  | { outcome: "failed"; reason: string };

export type TopicsTraceDeps = {
  /** Requeues the event with only these facets; false once the retry budget is spent. */
  scheduleRetry: (facets: TopicFacetRef[]) => Promise<boolean>;
};

/** Facets whose current version is the one trace-batch selected; older versions are skipped. */
function currentFacets(
  event: TopicsTraceEventType,
  facets: Awaited<ReturnType<typeof listTopicFacets>>,
): TraceFacet[] {
  return event.facets.flatMap((ref) => {
    const facet = facets.find((candidate) => candidate.id === ref.facetId);
    const version = facet?.versions[0];
    if (!facet || version?.version !== ref.version) return [];
    return [{ name: facet.name, version, builtIn: facet.isBuiltIn }];
  });
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
        transcriptS3Key: event.transcriptS3Key,
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

function facetKey(row: { facetId: string; facetVersion: number }): string {
  return JSON.stringify([row.facetId, row.facetVersion]);
}

async function processEvent(
  event: TopicsTraceEventType,
  deps: TopicsTraceDeps,
): Promise<TopicsTraceOutcome> {
  const { projectId, traceId } = event;
  if (!isTopicsProjectEnabled(projectId)) return { outcome: "disabled" };
  const models = (await getEnabledTopicsModels([projectId])).get(projectId);
  if (!models) return { outcome: "disabled" };
  const facets = currentFacets(event, await listTopicFacets(projectId));
  if (facets.length === 0) return { outcome: "stale" };

  const inputs = await readInputs(event);
  if (!inputs) return { outcome: "failed", reason: "invalid_input" };

  let rows: TopicSummary[] = [];
  let failure: unknown;
  try {
    const result = await summarizeTraceFacetVersions({
      projectId,
      traceId,
      ...inputs.traceContext,
      traceName: inputs.traceContext.traceName ?? "",
      transcript: inputs.transcript,
      models,
      facets,
    });
    if (result.outcome === "disabled") return { outcome: "disabled" };
    rows = result.rows;
    failure = result.failure;
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
    await pauseForRejectedConnection(projectId, failure);
    return { outcome: "failed", reason };
  }
  if (isRetryableProviderError(failure)) {
    const done = new Set(rows.map(facetKey));
    const pending = event.facets.filter(
      (facet) => !done.has(facetKey({ ...facet, facetVersion: facet.version })),
    );
    if (pending.length > 0 && (await deps.scheduleRetry(pending)))
      return { outcome: "retry_scheduled" };
    return { outcome: "failed", reason };
  }
  if (failure instanceof TopicsProviderUnavailable)
    return { outcome: "failed", reason };
  if (failure instanceof TopicInputTooLarge)
    return { outcome: "failed", reason: "input_too_large" };
  throw failure;
}

/**
 * Summarizes the facet versions trace-batch selected for one stored transcript,
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
    ...(result.outcome === "failed" ? { reason: result.reason } : {}),
  });
  return result;
}
