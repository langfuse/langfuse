import { prisma } from "@langfuse/shared/src/db";
import {
  ClickHouseResourceError,
  logger,
  recordDistribution,
} from "@langfuse/shared/src/server";
import { selectSummarizedTopicMatches } from "@langfuse/shared/topics/server";
import {
  TOPICS_MAX_SELECTION_RANGE_MS,
  type TopicFacetRef,
  type TopicRule,
  type TopicSummary,
  type TopicTimeRange,
} from "@langfuse/shared/topics";

const DAY_MS = 86_400_000;
// How far back from the window's end each step extends the match.
const SLICE_REACH_MS = [7 * DAY_MS, 14 * DAY_MS, TOPICS_MAX_SELECTION_RANGE_MS];

/**
 * Traces of a refit window that meet the rule's filter, matched newest slice
 * first. A failure in the newest slice throws; a failure further back ends the
 * match, and the returned window covers the slices that completed.
 */
export async function matchRefitWindow({
  facet,
  filter,
  timeRange,
  ...run
}: {
  projectId: string;
  ruleId: string;
  runId: string;
  facet: TopicFacetRef;
  filter: TopicRule["filter"];
  timeRange: TopicTimeRange;
}): Promise<{ traceIds: Set<string>; timeRange: TopicTimeRange }> {
  const traceIds = new Set<string>();
  let to = timeRange.to;
  for (const reach of SLICE_REACH_MS) {
    const from = new Date(
      Math.max(timeRange.from.getTime(), timeRange.to.getTime() - reach),
    );
    if (from >= to) break;
    const slice = `${reach / DAY_MS}d`;
    const startedAt = performance.now();
    let outcome = "success";
    try {
      const matches = await selectSummarizedTopicMatches(
        { projectId: run.projectId, facet, filter, from, to },
        prisma,
      );
      for (const id of matches) traceIds.add(id);
    } catch (error) {
      outcome =
        ClickHouseResourceError.is(error) && error.errorType === "TIMEOUT"
          ? "timeout"
          : "error";
      if (to === timeRange.to) throw error;
      // The message carries the ClickHouse query ID.
      logger.warn("Topics refit filter match stopped early", {
        ...run,
        facetId: facet.facetId,
        slice,
        outcome,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    } finally {
      recordDistribution(
        "langfuse.topics.refit_filter_scan_ms",
        performance.now() - startedAt,
        { slice, outcome, unit: "milliseconds" },
      );
    }
    to = from;
  }
  return { traceIds, timeRange: { from: to, to: timeRange.to } };
}

/** Summaries of the matched traces; a summary without a trace has no filter to meet. */
export function matchedSummaries(
  summaries: TopicSummary[],
  traceIds: ReadonlySet<string>,
): TopicSummary[] {
  return summaries.filter(({ traceId }) => !traceId || traceIds.has(traceId));
}
