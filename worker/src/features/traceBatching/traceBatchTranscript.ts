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
  "transcript_tokens",
  "transcript_current_turn_tokens",
  "transcript_history_tokens",
  "transcript_tool_response_tokens",
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

async function recordTokenEstimates(transcript: Transcript, span: Span) {
  let unavailable = false;
  const estimate = async (
    metric: (typeof TOKEN_METRICS)[number],
    text: unknown,
  ) => {
    const tokens = await tokenCountAsync({ model: TOKENIZER_MODEL, text });
    if (tokens === undefined) {
      if (!unavailable) {
        recordIncrement("langfuse.trace_batch.token_estimation_unavailable", 1);
        span.setAttribute(
          "langfuse.trace_batch.token_estimation",
          "unavailable",
        );
        unavailable = true;
      }
    } else {
      recordTokens(span, metric, tokens);
    }
    return tokens;
  };

  // Submit sequentially: the tokenizer pool is shared with ingestion, and the
  // batch may buffer the next trace while this promise is pending.
  const total = await estimate("transcript_tokens", transcript);
  if (
    transcript.threads.some(
      ({ conversationHistory }) => conversationHistory.length > 0,
    )
  ) {
    await estimate("transcript_current_turn_tokens", {
      threads: transcript.threads.map(({ currentTurn }) => ({
        conversationHistory: [],
        currentTurn,
      })),
    });
    // Object-shaped projections keep the tokenizer on its JSON path rather than
    // interpreting a message array as a provider chat request.
    await estimate("transcript_history_tokens", {
      threads: transcript.threads.map(({ conversationHistory }) => ({
        conversationHistory,
      })),
    });
  } else {
    if (total !== undefined)
      recordTokens(span, "transcript_current_turn_tokens", total);
    recordTokens(span, "transcript_history_tokens", 0);
  }
  const toolResponses = transcript.threads.flatMap(
    ({ conversationHistory, currentTurn }) =>
      [...conversationHistory, ...currentTurn.messages].flatMap((message) => {
        const parts =
          message.role === "tool"
            ? message.parts
            : message.parts.filter((part) => part.type === "tool-result");
        return parts.length ? [{ ...message, parts }] : [];
      }),
  );
  if (toolResponses.length) {
    await estimate("transcript_tool_response_tokens", {
      messages: toolResponses,
    });
  } else {
    recordTokens(span, "transcript_tool_response_tokens", 0);
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
    const transcript = assembleTranscript(
      orderObservations(observations),
      (timings) => {
        phaseTimings = timings;
      },
    );
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
    if (span.isRecording()) {
      // JSON string length in UTF-16 code units; do not retain the serialized copy.
      span.setAttribute(
        "langfuse.trace_batch.transcript_characters",
        transcript === null ? 0 : JSON.stringify(transcript).length,
      );
    }

    if (transcript === null) {
      for (const metric of TOKEN_METRICS) recordTokens(span, metric, 0);
      span.end();
      return Promise.resolve();
    }

    // Callbacks capture only the span, releasing observations while the next trace streams.
    return recordTokenEstimates(transcript, span)
      .catch(() => {
        // A missing experiment metric must not retry all reads in the batch.
        recordIncrement("langfuse.trace_batch.token_estimation_failed", 1);
        span.setAttribute("langfuse.trace_batch.token_estimation", "failed");
      })
      .finally(() => span.end());
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Transcript assembly failed",
    });
    span.end();
    throw error;
  }
}
