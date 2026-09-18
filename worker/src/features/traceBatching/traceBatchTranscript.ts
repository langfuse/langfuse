import { type Model, type Observation } from "@langfuse/shared";
import {
  assembleTranscript,
  orderObservations,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
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
  const startedAt = performance.now();
  const transcript = assembleTranscript(orderObservations(observations));
  recordDistribution(
    "langfuse.trace_batch.transcript_assembly_duration_ms",
    performance.now() - startedAt,
    { has_transcript: String(transcript !== null) },
  );

  if (transcript === null) {
    recordDistribution("langfuse.trace_batch.transcript_tokens", 0, {
      tokenizer: "o200k_base",
    });
    return Promise.resolve();
  }

  // Returning only the tokenization promise lets the caller release observations
  // and stream the next trace while the tokenizer thread processes its copy.
  const tokenizationStartedAt = performance.now();
  return tokenCountAsync({ model: TOKENIZER_MODEL, text: transcript })
    .then((tokens) => {
      if (tokens === undefined) {
        recordIncrement("langfuse.trace_batch.token_estimation_unavailable", 1);
        return;
      }
      recordDistribution("langfuse.trace_batch.transcript_tokens", tokens, {
        tokenizer: "o200k_base",
      });
    })
    .catch(() => {
      // A missing experiment metric must not retry all reads in the batch.
      recordIncrement("langfuse.trace_batch.token_estimation_failed", 1);
    })
    .finally(() => {
      recordDistribution(
        "langfuse.trace_batch.transcript_tokenization_duration_ms",
        performance.now() - tokenizationStartedAt,
      );
    });
}
