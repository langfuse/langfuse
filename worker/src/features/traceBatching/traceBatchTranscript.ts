import { type Model, type Observation } from "@langfuse/shared";
import {
  assembleTranscript,
  orderObservations,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { tokenCountAsync } from "../tokenisation/async-usage";

// A fixed tokenizer makes payload sizes comparable across models and projects.
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

export async function recordTraceBatchTranscript(
  observations: Observation[],
): Promise<void> {
  const startedAt = performance.now();
  const transcript = assembleTranscript(orderObservations(observations));
  recordDistribution(
    "langfuse.trace_batch.transcript_assembly_duration_ms",
    performance.now() - startedAt,
    { has_transcript: String(transcript !== null) },
  );

  // Finish this trace's token count before continuing the stream so the
  // tokenizer pool cannot accumulate work for a whole batch.
  const tokens =
    transcript === null
      ? 0
      : await tokenCountAsync({ model: TOKENIZER_MODEL, text: transcript });
  if (tokens === undefined) {
    recordIncrement("langfuse.trace_batch.token_estimation_unavailable", 1);
    return;
  }
  recordDistribution("langfuse.trace_batch.transcript_tokens", tokens, {
    tokenizer: "gpt-4o",
  });
}
