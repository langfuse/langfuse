import { APICallError } from "ai";
import { embedLLMText, type LLMProviderOptions } from "../llm/llmText";
import { LLMAdapter } from "../llm/types";
import { topicEmbeddingConfigSchema } from "../../topics";
import type { TopicsModel } from "./model-config";

// The AI SDK validates the whole Bedrock options object, and each family names
// its size option differently, so only the family's own fields are sent.
function bedrockEmbeddingOptions(
  modelId: string,
  dimensions: number | undefined,
): Record<string, string | number> {
  if (modelId.includes("nova"))
    return {
      embeddingPurpose: "CLUSTERING",
      ...(dimensions && { embeddingDimension: dimensions }),
    };
  if (modelId.includes("cohere"))
    return {
      inputType: "clustering",
      truncate: "NONE",
      ...(dimensions && { outputDimension: dimensions }),
    };
  return dimensions ? { dimensions } : {};
}

// Discovery and later centroid assignment must share one vector space, so
// every provider is asked for clustering vectors, of the configured size when set.
function embeddingProviderOptions(
  model: TopicsModel,
  dimensions: number | undefined,
): LLMProviderOptions {
  if (model.adapter === LLMAdapter.Bedrock)
    return { amazonBedrock: bedrockEmbeddingOptions(model.model, dimensions) };
  const google = {
    taskType: "CLUSTERING",
    ...(dimensions && { outputDimensionality: dimensions }),
  };
  return {
    openai: dimensions ? { dimensions } : {},
    google,
    vertex: google,
  };
}

/** Embeds one summary through the project's LLM connection. */
export async function generateTopicEmbedding(params: {
  model: TopicsModel;
  summary: string;
  dimensions: number;
}) {
  const { embeddingDimensions } = topicEmbeddingConfigSchema.parse({
    embeddingDimensions: params.dimensions,
  });
  const embed = (dimensions: number | undefined) =>
    embedLLMText({
      model: { adapter: params.model.adapter, id: params.model.model },
      connection: params.model.connection,
      value: params.summary,
      providerOptions: embeddingProviderOptions(params.model, dimensions),
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(60_000),
    });
  const result = await embed(embeddingDimensions).catch((error: unknown) => {
    // Fixed-size models (e.g. ada-002, Titan v1) reject a size option; callers
    // still require the configured length, so a mismatch fails clearly.
    if (APICallError.isInstance(error) && error.statusCode === 400)
      return embed(undefined);
    throw error;
  });
  return { embedding: result.embedding, tokens: result.usage.tokens };
}
