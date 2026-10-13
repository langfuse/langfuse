import { getLLMErrorInfo } from "../llm/errors";
import { embedLLMText, type LLMProviderOptions } from "../llm/llmText";
import { LLMAdapter } from "../llm/types";
import { topicEmbeddingConfigSchema } from "../../topics";
import type { TopicsModel } from "./model-config";

/** Embeds one summary through the project's LLM connection. */
export async function generateTopicEmbedding(params: {
  model: TopicsModel;
  summary: string;
  dimensions: number;
}) {
  const { embeddingDimensions } = topicEmbeddingConfigSchema.parse({
    embeddingDimensions: params.dimensions,
  });
  const result = await embedWithSizeFallback(params, embeddingDimensions);
  return { embedding: result.embedding, tokens: result.usage.tokens };
}

async function embedWithSizeFallback(
  params: Parameters<typeof generateTopicEmbedding>[0],
  embeddingDimensions: number,
) {
  const embed = (dimensions: number | undefined) =>
    embedLLMText({
      model: { adapter: params.model.adapter, id: params.model.model },
      connection: params.model.connection,
      value: params.summary,
      providerOptions: embeddingProviderOptions(params.model, dimensions),
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(60_000),
    });
  try {
    return await embed(embeddingDimensions);
  } catch (error) {
    const info = getLLMErrorInfo(error);
    if (info?.kind === "provider" && info.statusCode === 400)
      return embed(undefined);
    throw error;
  }
}

/** Keeps discovery and centroid assignment in the same clustering vector space. */
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

/** The Bedrock SDK validates all options, so send only the model family's size field. */
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
