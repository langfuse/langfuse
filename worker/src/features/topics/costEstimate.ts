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
  readTopicCostEstimate,
  topicMatchingTraceIdsQuery,
  writeTopicCostEstimateProgress,
} from "@langfuse/shared/topics/server";
import {
  TOPICS_CHARS_PER_TOKEN,
  TOPICS_COST_ESTIMATE_EMBEDDING_TOKENS_PER_FACET,
  TOPICS_COST_ESTIMATE_OUTPUT_TOKENS_PER_FACET,
  TOPICS_COST_ESTIMATE_SAMPLE_SIZE,
  topicProcessingConfigSchema,
  topicTokenizerFamily,
  type TopicCostEstimate,
} from "@langfuse/shared/topics";
import { env } from "../../env";
import { toTraceEventObservation } from "../eventsDispatch/traceEvents";
import { buildTopicSummaryRequest } from "./models";
import { keyTopicTraceFacets } from "./summarizeAssembledTrace";

const DAY_MS = 86_400_000;
// Fallback when a project has no stored idle time, as in setup.
const DEFAULT_IDLE_MS = 600_000;
// Traces this large are not read: the transcript would exceed the stored limit.
const MAX_TRACE_ROWS = 2_000;
const MAX_TRACE_BYTES = 10 * 1024 * 1024;
// One events_full read covers at most this many traces and event bytes.
const BATCH_TRACES = 10;
const BATCH_BYTES = 16 * 1024 * 1024;
const PROGRESS_INTERVAL_MS = 1_000;

class EstimateInputError extends Error {}

type SampledTrace = Awaited<
  ReturnType<typeof getTopicCostEstimateSample>
>["traces"][number];

function batchTraces(traces: SampledTrace[]) {
  const batches: SampledTrace[][] = [];
  let current: SampledTrace[] = [];
  let bytes = 0;
  for (const trace of traces) {
    if (
      current.length &&
      (current.length >= BATCH_TRACES || bytes + trace.eventBytes > BATCH_BYTES)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(trace);
    bytes += trace.eventBytes;
  }
  if (current.length) batches.push(current);
  return batches;
}

function topTraceNames(traces: SampledTrace[]) {
  const counts = new Map<string, number>();
  for (const { name } of traces)
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
}

/**
 * Measures what summarizing a sample of finished traces would send, without
 * calling a model: one events_core pass picks the sample, then events_full
 * streams the traces in small batches and each trace is measured as its rows
 * end, so the record shows progress while the job runs.
 */
export async function runTopicCostEstimate(
  projectId: string,
  estimateKey: string,
): Promise<void> {
  const loaded = await readTopicCostEstimate(projectId, estimateKey);
  if (!loaded || loaded.status !== "running") return;
  const record: TopicCostEstimate = structuredClone(loaded);
  let lastWrite = 0;
  let owned = true;
  const progress = async (force = false) => {
    if (!force && Date.now() - lastWrite < PROGRESS_INTERVAL_MS) return;
    lastWrite = Date.now();
    owned = await writeTopicCostEstimateProgress(projectId, record);
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
      throw new EstimateInputError(
        "None of the selected questions exist anymore.",
      );
    const keyed = keyTopicTraceFacets([
      ...selected.filter((facet) => facet.builtIn),
      ...selected.filter((facet) => !facet.builtIn),
    ]);
    const config = topicProcessingConfigSchema.parse({});
    const charsPerToken =
      TOPICS_CHARS_PER_TOKEN[topicTokenizerFamily(summaryModel)];
    const outputTokens =
      TOPICS_COST_ESTIMATE_OUTPUT_TOKENS_PER_FACET * keyed.length;
    const embeddingTokens =
      TOPICS_COST_ESTIMATE_EMBEDDING_TOKENS_PER_FACET * keyed.length;

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
        ? { finishedTraces: 0, traces: [] }
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
    record.finishedTraces7d = sample.finishedTraces;
    record.sampled = sample.traces.length;
    record.traceNames = topTraceNames(sample.traces);
    await progress(true);

    const readable: SampledTrace[] = [];
    for (const trace of sample.traces) {
      if (trace.rows > MAX_TRACE_ROWS || trace.eventBytes > MAX_TRACE_BYTES) {
        record.processed++;
        record.skipped.tooLarge++;
      } else readable.push(trace);
    }

    const measure = (rows: EventsDispatchEventRow[]) => {
      record.processed++;
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
      const text = renderStoredTopicText(
        context.transcript,
        context.executionIssues,
      );
      // The summarizer's own limit; such traces are never sent.
      if (text.length > env.LANGFUSE_TOPICS_MAX_INPUT_CHARACTERS) {
        record.skipped.tooLarge++;
        return;
      }
      const request = buildTopicSummaryRequest(keyed, text, config);
      const prefixChars =
        request.system.reduce((sum, part) => sum + part.text.length, 0) +
        JSON.stringify(z.toJSONSchema(request.schema)).length;
      const prefixTokens = Math.ceil(prefixChars / charsPerToken);
      const inputTokens = Math.ceil(request.input.length / charsPerToken);
      record.summarizable++;
      record.tokens.prefixTokens += prefixTokens;
      record.tokens.inputTokens += inputTokens;
      record.tokens.outputTokens += outputTokens;
      record.tokens.embeddingTokens += embeddingTokens;
    };

    for (const batch of batchTraces(readable)) {
      let traceId: string | null = null;
      let rows: EventsDispatchEventRow[] = [];
      const flush = async () => {
        if (traceId === null) return;
        // Measuring is synchronous; yielding lets the ClickHouse socket drain between traces.
        await new Promise((resolve) => setImmediate(resolve));
        measure(rows);
        rows = [];
        await progress();
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
        if (!owned) return;
      }
      await flush();
      if (!owned) return;
    }
    // Traces without rows in events_full were deleted after the sample was drawn.
    const unread = sample.traces.length - record.processed;
    record.processed += unread;
    record.skipped.noContent += unread;

    record.status = "done";
    record.finishedAt = Date.now();
    await finishTopicCostEstimate(projectId, record);
  } catch (error) {
    logger.error("Topics cost estimate failed", { projectId, error });
    record.status = "failed";
    record.finishedAt = Date.now();
    record.error =
      error instanceof EstimateInputError
        ? error.message
        : "The estimate failed. Try again.";
    await finishTopicCostEstimate(projectId, record);
  }
}
