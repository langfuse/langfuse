import { embedLLMText } from "../llm/llmText";
import { topicEmbeddingConfigSchema } from "../../topics";
import type { TopicsModel } from "./model-config";

// Bedrock Titan and Nova accept fewer output sizes than Cohere.
const TITAN_DIMENSIONS = new Set([256, 512, 1024]);
const NOVA_DIMENSIONS = new Set([256, 1024]);

/** Embeds one summary through the project's LLM connection. */
export async function generateTopicEmbedding(params: {
  model: TopicsModel;
  summary: string;
  dimensions: number;
}) {
  const { embeddingDimensions } = topicEmbeddingConfigSchema.parse({
    embeddingDimensions: params.dimensions,
  });
  const result = await embedLLMText({
    model: { adapter: params.model.adapter, id: params.model.model },
    connection: params.model.connection,
    value: params.summary,
    // Discovery and later centroid assignment must share one vector space, so
    // every provider is asked for clustering vectors of the configured size.
    providerOptions: {
      openai: { dimensions: embeddingDimensions },
      amazonBedrock: {
        inputType: "clustering",
        outputDimension: embeddingDimensions,
        truncate: "NONE",
        embeddingPurpose: "CLUSTERING",
        ...(TITAN_DIMENSIONS.has(embeddingDimensions)
          ? { dimensions: embeddingDimensions }
          : {}),
        ...(NOVA_DIMENSIONS.has(embeddingDimensions)
          ? { embeddingDimension: embeddingDimensions }
          : {}),
      },
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
    abortSignal: AbortSignal.timeout(60_000),
  });
  return { embedding: result.embedding, tokens: result.usage.tokens };
}
