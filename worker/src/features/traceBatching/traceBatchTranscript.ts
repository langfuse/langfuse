import { type Model, type Observation } from "@langfuse/shared";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import {
  assembleTranscript,
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
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { tokenCountAsync } from "../tokenisation/async-usage";

// A fixed tokenizer makes payload sizes comparable across models and projects.
// gpt-4o selects o200k_base, also used by GPT-5 mini and nano.
// This model is only an in-memory tokenizer configuration, never persisted.
const TOKENIZER_MODEL: Model = {
  id: "trace-batch-token-estimate",
  modelName: "gpt-4o",
  tokenizerId: "openai",
  tokenizerConfig: { tokenizerModel: "gpt-4o" },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  projectId: null,
  matchPattern: "",
  startDate: null,
  inputPrice: null,
  outputPrice: null,
  totalPrice: null,
  unit: "TOKENS",
};

const TOKEN_METRICS = [
  "transcript_message_tokens",
  "transcript_current_turn_tokens",
  "transcript_history_tokens",
] as const;

function recordTokens(
  span: Span,
  metric: (typeof TOKEN_METRICS)[number],
  tokens: number,
) {
  recordDistribution(`langfuse.trace_batch.${metric}`, tokens, {
    tokenizer: "o200k_base",
  });
  span.setAttribute(`langfuse.trace_batch.${metric}`, tokens);
}

function recordCharacterCounts(transcript: Transcript | null, span: Span) {
  let total = 0;
  let toolResponses = 0;
  for (const thread of transcript?.threads ?? []) {
    for (const messages of [
      thread.conversationHistory,
      thread.currentTurn.messages,
    ]) {
      for (const message of messages) {
        for (const part of message.parts) {
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
    recordDistribution(`langfuse.trace_batch.${metric}`, characters);
    span.setAttribute(`langfuse.trace_batch.${metric}`, characters);
  }
}

async function recordTokenEstimates(transcript: Transcript, span: Span) {
  const currentTurn = transcript.threads.flatMap(
    ({ currentTurn }) => currentTurn.messages,
  );
  const history = transcript.threads.flatMap(
    ({ conversationHistory }) => conversationHistory,
  );
  let total = 0;
  let unavailable = false;
  // Count each message in just one partition. Submit sequentially to keep one
  // pending tokenizer request per batch in the pool shared with ingestion.
  for (const [metric, messages] of [
    ["transcript_current_turn_tokens", currentTurn],
    ["transcript_history_tokens", history],
  ] as const) {
    const tokens = messages.length
      ? await tokenCountAsync({
          model: TOKENIZER_MODEL,
          // Both partitions exclude provenance and use identical JSON framing.
          text: {
            messages: messages.map(({ role, parts }) => ({ role, parts })),
          },
        })
      : 0;
    if (tokens === undefined) {
      if (!unavailable) {
        recordIncrement("langfuse.trace_batch.token_estimation_unavailable", 1);
        span.setAttribute(
          "langfuse.trace_batch.token_estimation",
          "unavailable",
        );
      }
      unavailable = true;
    } else {
      recordTokens(span, metric, tokens);
      total += tokens;
    }
  }
  if (!unavailable) {
    recordTokens(span, "transcript_message_tokens", total);
  }
}

function recordTopicsRendering(
  transcript: Transcript | null,
  observations: Observation[],
  span: Span,
): string | undefined {
  try {
    const { text, stats } = renderTranscript(
      transcript,
      observations,
      topicsTranscriptConfig,
    );
    const metric = (name: string, value: number) => {
      recordDistribution(`langfuse.trace_batch.${name}`, value);
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
        recordDistribution(
          "langfuse.trace_batch.topics_transcript_block_characters",
          characters,
          { block, stage },
        );
        span.setAttribute(
          `langfuse.trace_batch.topics_transcript_block_${block}_${stage}_characters`,
          characters,
        );
      }
    }
    return text;
  } catch {
    recordIncrement("langfuse.trace_batch.topics_transcript_failed", 1);
    span.setAttribute("langfuse.trace_batch.topics_transcript", "failed");
    return undefined;
  }
}

async function recordTopicsTokens(text: string, span: Span) {
  const tokens = text
    ? await tokenCountAsync({ model: TOKENIZER_MODEL, text })
    : 0;
  if (tokens === undefined) {
    recordIncrement(
      "langfuse.trace_batch.topics_transcript_token_estimation_unavailable",
      1,
    );
    span.setAttribute("langfuse.trace_batch.topics_transcript", "unavailable");
    return;
  }
  recordDistribution("langfuse.trace_batch.topics_transcript_tokens", tokens, {
    tokenizer: "o200k_base",
  });
  span.setAttribute("langfuse.trace_batch.topics_transcript_tokens", tokens);
}

async function recordTranscriptJsonTokens(text: string | null, span: Span) {
  const tokens =
    text === null ? 0 : await tokenCountAsync({ model: TOKENIZER_MODEL, text });
  if (tokens === undefined) {
    recordIncrement(
      "langfuse.trace_batch.transcript_json_token_estimation_unavailable",
      1,
    );
    span.setAttribute("langfuse.trace_batch.transcript_json", "unavailable");
    return;
  }
  recordDistribution("langfuse.trace_batch.transcript_json_tokens", tokens, {
    tokenizer: "o200k_base",
  });
  span.setAttribute("langfuse.trace_batch.transcript_json_tokens", tokens);
}

async function recordGenericTranscriptTokens(text: string, span: Span) {
  const tokens = text
    ? await tokenCountAsync({ model: TOKENIZER_MODEL, text })
    : 0;
  if (tokens === undefined) {
    recordIncrement(
      "langfuse.trace_batch.generic_transcript_token_estimation_unavailable",
      1,
    );
    span.setAttribute("langfuse.trace_batch.generic_transcript", "unavailable");
    return;
  }
  recordDistribution("langfuse.trace_batch.generic_transcript_tokens", tokens, {
    tokenizer: "o200k_base",
  });
  span.setAttribute("langfuse.trace_batch.generic_transcript_tokens", tokens);
}

function recordGenericRendering(
  transcript: Transcript | null,
  observations: Observation[],
  span: Span,
): string | undefined {
  try {
    const text = renderGenericTranscript(transcript, observations);
    recordDistribution(
      "langfuse.trace_batch.generic_transcript_characters",
      text.length,
    );
    span.setAttribute(
      "langfuse.trace_batch.generic_transcript_characters",
      text.length,
    );
    return text;
  } catch {
    recordIncrement("langfuse.trace_batch.generic_transcript_failed", 1);
    span.setAttribute("langfuse.trace_batch.generic_transcript", "failed");
    return undefined;
  }
}

export function recordTraceBatchTranscript(
  observations: Observation[],
): Promise<void> {
  // Inherit the batch parent without activating this span while the next trace streams.
  const span = getTracer("trace-batch").startSpan("trace-batch-transcript", {
    attributes: {
      "langfuse.project.id": observations[0]?.projectId,
      "langfuse.trace.id": observations[0]?.traceId ?? undefined,
      "langfuse.trace_batch.observation_count": observations.length,
      "langfuse.trace_batch.experiment_id":
        env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID,
      "langfuse.trace_batch.tokenizer": "o200k_base",
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
    const transcript = assembleTranscript(orderedObservations, (timings) => {
      phaseTimings = timings;
    });
    const assemblyDurationMs = performance.now() - startedAt;
    recordDistribution(
      "langfuse.trace_batch.transcript_assembly_duration_ms",
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
      recordDistribution(
        "langfuse.trace_batch.transcript_assembly_phase_duration_ms",
        duration,
        { phase },
      );
      span.setAttribute(
        `langfuse.trace_batch.transcript_assembly_${phase}_duration_ms`,
        duration,
      );
    }
    const threadCount = transcript?.threads.length ?? 0;
    recordDistribution(
      "langfuse.trace_batch.transcript_thread_count",
      threadCount,
    );
    span.setAttribute(
      "langfuse.trace_batch.transcript_thread_count",
      threadCount,
    );
    recordCharacterCounts(transcript, span);
    const comparisonRenderStart = performance.now();
    const transcriptJson =
      transcript === null ? null : JSON.stringify(transcript);
    const transcriptJsonCharacters = transcriptJson?.length ?? 0;
    recordDistribution(
      "langfuse.trace_batch.transcript_json_characters",
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

    const genericText = recordGenericRendering(
      transcript,
      orderedObservations,
      span,
    );

    const topicsText = recordTopicsRendering(
      transcript,
      orderedObservations,
      span,
    );
    const comparisonRenderDurationMs =
      performance.now() - comparisonRenderStart;
    recordDistribution(
      "langfuse.trace_batch.transcript_comparison_render_duration_ms",
      comparisonRenderDurationMs,
    );
    span.setAttribute(
      "langfuse.trace_batch.transcript_comparison_render_duration_ms",
      comparisonRenderDurationMs,
    );

    if (transcript === null) {
      for (const metric of TOKEN_METRICS) recordTokens(span, metric, 0);
    }

    // Text estimates run sequentially while the next trace streams.
    return (async () => {
      if (transcript !== null) {
        try {
          await recordTokenEstimates(transcript, span);
        } catch {
          // A missing experiment metric must not retry all reads in the batch.
          recordIncrement("langfuse.trace_batch.token_estimation_failed", 1);
          span.setAttribute("langfuse.trace_batch.token_estimation", "failed");
        }
      }
      const comparisonTokenizationStart = performance.now();
      try {
        await recordTranscriptJsonTokens(transcriptJson, span);
      } catch {
        recordIncrement("langfuse.trace_batch.transcript_json_failed", 1);
        span.setAttribute("langfuse.trace_batch.transcript_json", "failed");
      }
      if (genericText !== undefined) {
        try {
          await recordGenericTranscriptTokens(genericText, span);
        } catch {
          recordIncrement("langfuse.trace_batch.generic_transcript_failed", 1);
          span.setAttribute(
            "langfuse.trace_batch.generic_transcript",
            "failed",
          );
        }
      }
      if (topicsText !== undefined) {
        try {
          await recordTopicsTokens(topicsText, span);
        } catch {
          recordIncrement("langfuse.trace_batch.topics_transcript_failed", 1);
          span.setAttribute("langfuse.trace_batch.topics_transcript", "failed");
        }
      }
      const comparisonTokenizationDurationMs =
        performance.now() - comparisonTokenizationStart;
      recordDistribution(
        "langfuse.trace_batch.transcript_comparison_tokenization_duration_ms",
        comparisonTokenizationDurationMs,
      );
      span.setAttribute(
        "langfuse.trace_batch.transcript_comparison_tokenization_duration_ms",
        comparisonTokenizationDurationMs,
      );
    })().finally(() => span.end());
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Transcript assembly failed",
    });
    span.end();
    throw error;
  }
}
