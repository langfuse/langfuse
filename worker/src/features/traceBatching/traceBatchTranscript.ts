import { type Observation } from "@langfuse/shared";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import {
  assembleTranscriptContext,
  buildTracesPath,
  getProductBaseUrl,
  getTracer,
  orderObservations,
  recordDistribution,
  recordIncrement,
  renderGenericTranscript,
  renderTranscript,
  topicsTranscriptConfig,
  transcriptBlockTypes,
  type Transcript,
  type TranscriptContext,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

function recordTranscriptDistribution(
  metric: string,
  value: number,
  tags?: { [tag: string]: string | number },
): void {
  if (env.LANGFUSE_TRACE_BATCH_TRANSCRIPT_METRICS_ENABLED !== "true") return;
  if (tags) {
    recordDistribution(`langfuse.trace_batch.${metric}`, value, tags);
    return;
  }
  recordDistribution(`langfuse.trace_batch.${metric}`, value);
}

function recordContentAndStructureCounts(
  transcript: Transcript | null,
  observationCount: number,
  span: Span,
) {
  let total = 0;
  let toolResponses = 0;
  let historyMessages = 0;
  let historyParts = 0;
  let currentTurnMessages = 0;
  let currentTurnParts = 0;
  let currentTurnToolCalls = 0;
  let currentTurnToolResults = 0;
  for (const thread of transcript?.threads ?? []) {
    for (const [section, messages] of [
      ["history", thread.conversationHistory],
      ["current_turn", thread.currentTurn.messages],
    ] as const) {
      if (section === "history") historyMessages += messages.length;
      else currentTurnMessages += messages.length;
      for (const message of messages) {
        for (const part of message.parts) {
          if (section === "history") historyParts++;
          else {
            currentTurnParts++;
            if (part.type === "tool-call") currentTurnToolCalls++;
            if (message.role === "tool" || part.type === "tool-result")
              currentTurnToolResults++;
          }
          // Use the same serialized-part basis for numerator and denominator;
          // exclude message wrappers and observation provenance from both.
          const characters = JSON.stringify(part).length;
          total += characters;
          if (message.role === "tool" || part.type === "tool-result") {
            toolResponses += characters;
          }
        }
      }
    }
  }
  for (const [metric, characters] of [
    ["transcript_content_characters", total],
    ["transcript_tool_response_characters", toolResponses],
  ] as const) {
    recordTranscriptDistribution(metric, characters);
    span.setAttribute(`langfuse.trace_batch.${metric}`, characters);
  }
  for (const [metric, count] of [
    ["transcript_observation_count", observationCount],
    ["transcript_history_message_count", historyMessages],
    ["transcript_history_part_count", historyParts],
    ["transcript_current_turn_message_count", currentTurnMessages],
    ["transcript_current_turn_part_count", currentTurnParts],
    ["transcript_current_turn_tool_call_count", currentTurnToolCalls],
    ["transcript_current_turn_tool_result_count", currentTurnToolResults],
  ] as const) {
    recordTranscriptDistribution(metric, count);
    span.setAttribute(`langfuse.trace_batch.${metric}`, count);
  }
}

function recordTopicsRendering(
  transcript: Transcript | null,
  observations: Observation[],
  span: Span,
): void {
  try {
    const { text, stats } = renderTranscript(
      transcript,
      observations,
      topicsTranscriptConfig,
    );
    const metric = (name: string, value: number) => {
      recordTranscriptDistribution(name, value);
      span.setAttribute(`langfuse.trace_batch.${name}`, value);
    };
    metric("topics_transcript_characters", text.length);
    metric("topics_transcript_blocks_cut", stats.blocksCut);
    metric("topics_transcript_history_characters", stats.historyCharacters);
    metric(
      "topics_transcript_current_turn_characters",
      stats.currentTurnCharacters,
    );
    const messageCharacters =
      stats.historyCharacters + stats.currentTurnCharacters;
    metric(
      "topics_transcript_history_share",
      messageCharacters ? stats.historyCharacters / messageCharacters : 0,
    );
    for (const block of transcriptBlockTypes) {
      if (stats.blockCharacters[block].raw === 0) continue;
      for (const stage of ["raw", "clipped"] as const) {
        const characters = stats.blockCharacters[block][stage];
        recordTranscriptDistribution(
          "topics_transcript_block_characters",
          characters,
          { block, stage },
        );
        span.setAttribute(
          `langfuse.trace_batch.topics_transcript_block_${block}_${stage}_characters`,
          characters,
        );
      }
    }
  } catch {
    recordIncrement("langfuse.trace_batch.topics_transcript_failed", 1);
    span.setAttribute("langfuse.trace_batch.topics_transcript", "failed");
  }
}

function recordGenericRendering(
  transcript: Transcript | null,
  observations: Observation[],
  span: Span,
): void {
  try {
    const text = renderGenericTranscript(transcript, observations);
    recordTranscriptDistribution("generic_transcript_characters", text.length);
    span.setAttribute(
      "langfuse.trace_batch.generic_transcript_characters",
      text.length,
    );
  } catch {
    recordIncrement("langfuse.trace_batch.generic_transcript_failed", 1);
    span.setAttribute("langfuse.trace_batch.generic_transcript", "failed");
  }
}

export function recordTraceBatchTranscript(
  observations: Observation[],
  onTranscript?: (context: TranscriptContext | null) => Promise<void>,
): Promise<void> {
  // Inherit the batch parent without activating this span while the next trace streams.
  const span = getTracer("trace-batch").startSpan("trace-batch-transcript", {
    attributes: {
      "langfuse.project.id": observations[0]?.projectId,
      "langfuse.trace.id": observations[0]?.traceId ?? undefined,
      "langfuse.trace_batch.observation_count": observations.length,
      "langfuse.trace_batch.experiment_id":
        env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID,
    },
  });
  try {
    if (span.isRecording() && env.NEXTAUTH_URL && observations[0]?.traceId) {
      const { projectId, traceId } = observations[0];
      span.setAttribute(
        "langfuse.trace.url",
        new URL(
          buildTracesPath({ projectId, query: { peek: traceId } }).slice(1),
          getProductBaseUrl(),
        ).toString(),
      );
    }
    const startedAt = performance.now();
    let phaseTimings = { normalizationMs: 0, matchingMs: 0 };
    const orderedObservations = orderObservations(observations);
    const context = assembleTranscriptContext(orderedObservations, {
      onTimings: (timings) => {
        phaseTimings = timings;
      },
    });
    const transcript = context?.transcript ?? null;
    const assemblyDurationMs = performance.now() - startedAt;
    recordTranscriptDistribution(
      "transcript_assembly_duration_ms",
      assemblyDurationMs,
      { has_transcript: String(transcript !== null) },
    );
    span.setAttributes({
      "langfuse.trace_batch.transcript_assembly_duration_ms":
        assemblyDurationMs,
      "langfuse.trace_batch.has_transcript": transcript !== null,
    });
    for (const [phase, duration] of [
      ["normalization", phaseTimings.normalizationMs],
      ["matching", phaseTimings.matchingMs],
    ] as const) {
      recordTranscriptDistribution(
        "transcript_assembly_phase_duration_ms",
        duration,
        { phase },
      );
      span.setAttribute(
        `langfuse.trace_batch.transcript_assembly_${phase}_duration_ms`,
        duration,
      );
    }
    const threadCount = transcript?.threads.length ?? 0;
    recordTranscriptDistribution("transcript_thread_count", threadCount);
    span.setAttribute(
      "langfuse.trace_batch.transcript_thread_count",
      threadCount,
    );
    recordContentAndStructureCounts(
      transcript,
      orderedObservations.length,
      span,
    );
    const comparisonRenderStart = performance.now();
    const transcriptJsonCharacters =
      transcript === null ? 0 : JSON.stringify(transcript).length;
    recordTranscriptDistribution(
      "transcript_json_characters",
      transcriptJsonCharacters,
    );
    span.setAttribute(
      "langfuse.trace_batch.transcript_json_characters",
      transcriptJsonCharacters,
    );
    if (span.isRecording())
      span.setAttribute(
        "langfuse.trace_batch.transcript_characters",
        transcriptJsonCharacters,
      );

    recordGenericRendering(transcript, orderedObservations, span);

    recordTopicsRendering(transcript, orderedObservations, span);
    const comparisonRenderDurationMs =
      performance.now() - comparisonRenderStart;
    recordTranscriptDistribution(
      "transcript_comparison_render_duration_ms",
      comparisonRenderDurationMs,
    );
    span.setAttribute(
      "langfuse.trace_batch.transcript_comparison_render_duration_ms",
      comparisonRenderDurationMs,
    );

    span.end();
    // Consumer work is asynchronous and outside the assembly error boundary.
    return Promise.resolve().then(() => onTranscript?.(context));
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Transcript assembly failed",
    });
    span.end();
    throw error;
  }
}
