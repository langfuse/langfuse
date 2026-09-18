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

  // Measure payload content, without observation IDs, timestamps or costs.
  // Parsed I/O avoids counting ClickHouse's JSON string escaping twice.
  const rawPayload = observations.map((observation) => ({
    input: observation.input,
    output: observation.output,
    metadata: observation.metadata,
    toolDefinitions: observation.toolDefinitions,
    toolCalls: observation.toolCalls,
    toolCallNames: observation.toolCallNames,
  }));
  // Await each estimate before reading another trace, keeping backpressure on
  // the stream and avoiding a batch-sized backlog in the tokenizer pool.
  for (const [representation, payload] of [
    ["observations", rawPayload],
    ["transcript", transcript],
  ] as const) {
    const tokens =
      payload === null
        ? 0
        : await tokenCountAsync({ model: TOKENIZER_MODEL, text: payload });
    if (tokens === undefined) {
      recordIncrement("langfuse.trace_batch.token_estimation_unavailable", 1, {
        representation,
      });
      continue;
    }
    recordDistribution(
      `langfuse.trace_batch.${representation}_tokens`,
      tokens,
      {
        tokenizer: "gpt-4o",
      },
    );
  }
}
