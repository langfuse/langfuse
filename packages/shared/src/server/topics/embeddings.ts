import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { embed } from "ai";
import { topicEmbeddingConfigSchema } from "../../topics";
import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";

/** Uses the shared AI SDK version for the Topics worker's embedding call. */
export async function generateTopicEmbedding(params: {
  summary: string;
  dimensions: number;
  region: string;
  profile?: string;
}) {
  const config = topicEmbeddingConfigSchema.parse({
    embeddingDimensions: params.dimensions,
  });
  assertValidBedrockRegion(params.region);
  const provider = createAmazonBedrock({
    region: params.region,
    ...createDefaultBedrockProviderAuth({ profile: params.profile }),
  });
  const result = await embed({
    model: provider.embeddingModel(config.embeddingModel),
    value: params.summary,
    providerOptions: {
      amazonBedrock: {
        // Discovery and later centroid assignment must share one vector space.
        inputType: "clustering",
        outputDimension: config.embeddingDimensions,
        truncate: "NONE",
      },
    },
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(60_000),
  });
  // Cohere defaults to float output; the SDK accepts only float vectors.
  return { embedding: result.embedding, tokens: result.usage.tokens };
}
