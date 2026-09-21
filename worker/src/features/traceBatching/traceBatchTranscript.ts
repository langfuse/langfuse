import { type Model, type Observation } from "@langfuse/shared";
import { SpanStatusCode } from "@opentelemetry/api";
import {
  assembleTranscript,
  buildTracesPath,
  getProductBaseUrl,
  getTracer,
  orderObservations,
  recordDistribution,
  recordIncrement,
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
    const transcript = assembleTranscript(orderObservations(observations));
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

    if (transcript === null) {
      recordDistribution("langfuse.trace_batch.transcript_tokens", 0, {
        tokenizer: "o200k_base",
      });
      span.setAttribute("langfuse.trace_batch.transcript_tokens", 0);
      span.end();
      return Promise.resolve();
    }

    // Callbacks capture only the span, releasing observations while the next trace streams.
    return tokenCountAsync({ model: TOKENIZER_MODEL, text: transcript })
      .then((tokens) => {
        if (tokens === undefined) {
          recordIncrement(
            "langfuse.trace_batch.token_estimation_unavailable",
            1,
          );
          span.setAttribute(
            "langfuse.trace_batch.token_estimation",
            "unavailable",
          );
          return;
        }
        recordDistribution("langfuse.trace_batch.transcript_tokens", tokens, {
          tokenizer: "o200k_base",
        });
        span.setAttribute("langfuse.trace_batch.transcript_tokens", tokens);
      })
      .catch(() => {
        // A missing experiment metric must not retry all reads in the batch.
        recordIncrement("langfuse.trace_batch.token_estimation_failed", 1);
        span.setAttribute("langfuse.trace_batch.token_estimation", "failed");
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Token estimation failed",
        });
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
