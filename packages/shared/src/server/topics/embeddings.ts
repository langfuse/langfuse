import { embedLLMText } from "../llm/llmText";
import { LLMAdapter } from "../llm/types";
import { topicEmbeddingConfigSchema } from "../../topics";
import type { TopicsModel } from "./model-config";

// The AI SDK validates the whole Bedrock options object, and each family names
// its size option differently, so only the family's own fields are sent.
function bedrockEmbeddingOptions(
  modelId: string,
  dimensions: number,
): Record<string, string | number> {
  if (modelId.includes("nova"))
    return { embeddingPurpose: "CLUSTERING", embeddingDimension: dimensions };
  if (modelId.includes("cohere"))
    return {
      inputType: "clustering",
      truncate: "NONE",
      outputDimension: dimensions,
    };
  return { dimensions };
}

/** Embeds summaries through the project's LLM connection in as few requests as the provider allows. */
export async function generateTopicEmbeddings(params: {
  model: TopicsModel;
  summaries: string[];
  dimensions: number;
}) {
  const { embeddingDimensions } = topicEmbeddingConfigSchema.parse({
    embeddingDimensions: params.dimensions,
  });
  const result = await embedLLMText({
    model: { adapter: params.model.adapter, id: params.model.model },
    connection: params.model.connection,
    values: params.summaries,
    // Discovery and later centroid assignment must share one vector space, so
    // every provider is asked for clustering vectors of the configured size.
    providerOptions:
      params.model.adapter === LLMAdapter.Bedrock
        ? {
            amazonBedrock: bedrockEmbeddingOptions(
              params.model.model,
              embeddingDimensions,
            ),
          }
        : {
            openai: { dimensions: embeddingDimensions },
            google: {
              taskType: "CLUSTERING",
              outputDimensionality: embeddingDimensions,
            },
            vertex: {
              taskType: "CLUSTERING",
              outputDimensionality: embeddingDimensions,
            },
          },
    maxRetries: 2,
    // Single-text models (Bedrock Titan, Nova) split a batch into one request per text.
    maxParallelCalls: 10,
    abortSignal: AbortSignal.timeout(60_000),
  });
  return { embeddings: result.embeddings, tokens: result.usage.tokens };
}
