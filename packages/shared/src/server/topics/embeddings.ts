import { getLLMErrorInfo } from "../llm/errors";
import { embedLLMText, type LLMProviderOptions } from "../llm/llmText";
import { LLMAdapter } from "../llm/types";
import { topicEmbeddingConfigSchema } from "../../topics";
import type { TopicsModel } from "./model-config";

/** Embeds summaries through the project's LLM connection in as few requests as the provider allows. */
export async function generateTopicEmbeddings(params: {
  model: TopicsModel;
  summaries: string[];
  dimensions: number;
}) {
  const { embeddingDimensions } = topicEmbeddingConfigSchema.parse({
    embeddingDimensions: params.dimensions,
  });
  const result = await embedWithSizeFallback(params, embeddingDimensions);
  return { embeddings: result.embeddings, tokens: result.usage.tokens };
}

async function embedWithSizeFallback(
  params: Parameters<typeof generateTopicEmbeddings>[0],
  embeddingDimensions: number,
) {
  const embed = (dimensions: number | undefined) =>
    embedLLMText({
      model: { adapter: params.model.adapter, id: params.model.model },
      connection: params.model.connection,
      values: params.summaries,
      dimensions,
      providerOptions: embeddingProviderOptions(params.model),
      maxRetries: 2,
      // Single-text models (Bedrock Titan, Nova) split a batch into one request per text.
      maxParallelCalls: 10,
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
function embeddingProviderOptions(model: TopicsModel): LLMProviderOptions {
  if (model.adapter === LLMAdapter.Bedrock)
    return { amazonBedrock: bedrockEmbeddingOptions(model.model) };
  const google = {
    taskType: "CLUSTERING",
  };
  return {
    google,
    vertex: google,
  };
}

function bedrockEmbeddingOptions(modelId: string): Record<string, string> {
  if (modelId.includes("nova"))
    return {
      embeddingPurpose: "CLUSTERING",
    };
  if (modelId.includes("cohere"))
    return {
      inputType: "clustering",
      truncate: "NONE",
    };
  return {};
}
