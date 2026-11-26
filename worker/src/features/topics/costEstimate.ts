import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import {
  assembleTranscriptContext,
  getTopicCostEstimateEventStream,
  getTopicCostEstimateSample,
  getTracingReadinessSettings,
  logger,
  orderObservations,
  prepareAssembledTopicTranscript,
  renderStoredTopicText,
  TRACE_TRANSCRIPT_MAX_CHARACTERS,
  type EventsDispatchEventRow,
} from "@langfuse/shared/src/server";
import {
  finishTopicCostEstimate,
  listTopicFacets,
  markTopicCostEstimateStarted,
  priceTopicCostEstimate,
  readTopicCostEstimate,
  topicMatchingTraceIdsQuery,
} from "@langfuse/shared/topics/server";
import {
  TOPICS_COST_ESTIMATE_SAMPLE_SIZE,
  topicProcessingConfigSchema,
  type TopicCostEstimate,
} from "@langfuse/shared/topics";
import { env } from "../../env";
import { toTraceEventObservation } from "../eventsDispatch/traceEvents";
import { recordTopicCostEstimate } from "./metrics";
import { buildTopicSummaryRequest, charsPerToken } from "./llm/models";
import { keyTopicTraceFacets } from "./summarizeAssembledTrace";

const DAY_MS = 86_400_000;
// Fallback when a project has no stored idle time, as in setup.
const DEFAULT_IDLE_MS = 600_000;
// Traces this large are not read, which bounds the job's memory and time.
const MAX_TRACE_ROWS = 2_000;
const MAX_TRACE_BYTES = 10 * 1024 * 1024;
// One events_full read covers at most this many traces and event bytes.
const BATCH_TRACES = 10;
const BATCH_BYTES = 16 * 1024 * 1024;
// Estimates share the setup queue, so a slow one fails rather than hold a slot.
const DEADLINE_MS = 2 * 60_000;
// Output tokens and embedding input tokens of one facet's summary, from a week of production usage.
const OUTPUT_TOKENS_PER_FACET = 70;
const EMBEDDING_TOKENS_PER_FACET = 15;

/** An error whose message is shown to the user. */
class EstimateError extends Error {}

type SampledTrace = Awaited<
  ReturnType<typeof getTopicCostEstimateSample>
>[number];

function batchTraces(traces: SampledTrace[]) {
  const batches: SampledTrace[][] = [];
  let current: SampledTrace[] = [];
  let bytes = 0;
  for (const trace of traces) {
    if (
      current.length > 0 &&
      (current.length >= BATCH_TRACES || bytes + trace.eventBytes > BATCH_BYTES)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(trace);
    bytes += trace.eventBytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Measures what summarizing a sample of finished traces would send, without
 * calling a model: one events_core pass picks the sample, then events_full
 * streams the traces in small batches and each trace is measured as its rows
 * end.
 */
export async function runTopicCostEstimate(
  projectId: string,
  estimateKey: string,
  runId: string,
): Promise<void> {
  const loaded = await readTopicCostEstimate(projectId, estimateKey);
  // A job that outlived its record must not run a newer estimate of the same inputs.
  if (!loaded || loaded.status !== "running" || loaded.runId !== runId) return;
  // A redelivered job starts from zero.
  const record: TopicCostEstimate = {
    ...loaded,
    sampled: 0,
    summarizable: 0,
    skipped: { tooLarge: 0, noContent: 0 },
    tokens: { inputTokens: 0, outputTokens: 0, embeddingTokens: 0 },
  };
  if (!(await markTopicCostEstimateStarted(projectId, record))) return;
  const deadline = Date.now() + DEADLINE_MS;
  const tenant = {
    projectId,
    orgId: await prisma.project
      .findUnique({ where: { id: projectId }, select: { orgId: true } })
      .then((project) => project?.orgId)
      .catch(() => undefined),
  };

  try {
    const { filter, facets: refs, summaryModel } = record.inputs;
    const allFacets = await listTopicFacets(projectId);
    const selected = refs.flatMap(({ facetId, version }) => {
      const facet = allFacets.find(({ id }) => id === facetId);
      const facetVersion = facet?.versions.find((v) => v.version === version);
      return facet && facetVersion
        ? [
            {
              name: facet.name,
              version: facetVersion,
              builtIn: facet.isBuiltIn,
            },
          ]
        : [];
    });
    if (selected.length === 0)
      throw new EstimateError("None of the selected questions exist anymore.");
    const keyed = keyTopicTraceFacets([
      ...selected.filter((facet) => facet.builtIn),
      ...selected.filter((facet) => !facet.builtIn),
    ]);
    const config = topicProcessingConfigSchema.parse({});
    // Everything but the transcript is the same for every trace.
    const fixed = buildTopicSummaryRequest(keyed, "", config);
    const fixedChars =
      fixed.system.reduce((sum, part) => sum + part.text.length, 0) +
      JSON.stringify(z.toJSONSchema(fixed.schema)).length +
      fixed.input.length;
    const ratio = charsPerToken(summaryModel);

    const now = new Date(record.startedAt);
    const matching =
      filter.length === 0
        ? undefined
        : await topicMatchingTraceIdsQuery(
            {
              projectId,
              filter,
              from: new Date(now.getTime() - 7 * DAY_MS - 3_600_000),
              to: now,
            },
            prisma,
          );
    const { traceIdleMs } = await getTracingReadinessSettings(projectId);
    const sample =
      matching === null
        ? []
        : await getTopicCostEstimateSample({
            projectId,
            idleMs: traceIdleMs ?? DEFAULT_IDLE_MS,
            now,
            limit: TOPICS_COST_ESTIMATE_SAMPLE_SIZE,
            seed: parseInt(
              createHash("sha256")
                .update(record.runId)
                .digest("hex")
                .slice(0, 8),
              16,
            ),
            matching,
          });
    // Unread traces leave the sample: production may still summarize them, so they are not free.
    const readable = sample.filter(
      (trace) =>
        trace.rows <= MAX_TRACE_ROWS && trace.eventBytes <= MAX_TRACE_BYTES,
    );
    record.sampled = readable.length;

    let read = 0;
    const measure = (rows: EventsDispatchEventRow[]) => {
      read++;
      const context = assembleTranscriptContext(
        orderObservations(rows.map(toTraceEventObservation)),
      );
      if (
        !context?.transcript ||
        !prepareAssembledTopicTranscript(context.transcript).hasContent
      ) {
        record.skipped.noContent++;
        return;
      }
      if (JSON.stringify(context).length > TRACE_TRANSCRIPT_MAX_CHARACTERS) {
        record.skipped.tooLarge++;
        return;
      }
      const { text } = renderStoredTopicText(
        context.transcript,
        context.executionIssues,
      );
      // The summarizer's own limit; such traces are never sent.
      if (text.length > env.LANGFUSE_TOPICS_MAX_INPUT_CHARACTERS) {
        record.skipped.tooLarge++;
        return;
      }
      record.summarizable++;
      record.tokens.inputTokens += Math.ceil(
        (fixedChars + text.length) / ratio,
      );
      record.tokens.outputTokens += OUTPUT_TOKENS_PER_FACET * keyed.length;
      record.tokens.embeddingTokens +=
        EMBEDDING_TOKENS_PER_FACET * keyed.length;
    };

    for (const batch of batchTraces(readable)) {
      let traceId: string | null = null;
      let rows: EventsDispatchEventRow[] = [];
      const flush = async () => {
        if (traceId === null) return;
        if (Date.now() > deadline)
          throw new EstimateError("The estimate took too long. Try again.");
        // Measuring is synchronous; yielding lets the ClickHouse socket drain between traces.
        await new Promise((resolve) => setImmediate(resolve));
        measure(rows);
        rows = [];
      };
      for await (const row of getTopicCostEstimateEventStream({
        projectId,
        traces: batch,
      })) {
        if (row.trace_id !== traceId) {
          await flush();
          traceId = row.trace_id;
        }
        rows.push(row);
      }
      await flush();
    }
    // Traces without rows in events_full were deleted after the sample was drawn.
    record.skipped.noContent += readable.length - read;

    record.status = "done";
    record.finishedAt = Date.now();
    // Not written when the record expired or a newer run replaced it.
    const written = await finishTopicCostEstimate(projectId, record);
    // Priced like the UI; a pricing failure must not fail a finished estimate.
    const prices = written
      ? await priceTopicCostEstimate(projectId, record).catch(() => null)
      : null;
    recordTopicCostEstimate(
      written ? "done" : "superseded",
      record.startedAt,
      tenant,
      prices?.perTraceUsd != null ? prices.perTraceUsd * 1000 : undefined,
    );
  } catch (error) {
    logger.error("Topics cost estimate failed", { projectId, error });
    record.status = "failed";
    record.finishedAt = Date.now();
    record.error =
      error instanceof EstimateError
        ? error.message
        : "The estimate failed. Try again.";
    await finishTopicCostEstimate(projectId, record);
    recordTopicCostEstimate("failed", record.startedAt, tenant);
  }
}
