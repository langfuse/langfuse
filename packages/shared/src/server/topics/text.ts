import { Output, type ModelMessage } from "ai";
import type { z } from "zod";
import { generateLLMText } from "../llm/llmText";
import { LLMAdapter } from "../llm/types";
import type { TopicsModel } from "./model-config";

/** Structured Topics text through the project's LLM connection. */
export async function generateTopicText<T>(params: {
  model: TopicsModel;
  messages: ModelMessage[];
  schema: z.ZodType<T>;
  maxOutputTokens: number;
}) {
  return generateLLMText({
    model: { adapter: params.model.adapter, id: params.model.model },
    connection: params.model.connection,
    messages: params.messages,
    output: Output.object({ schema: params.schema }),
    maxOutputTokens: params.maxOutputTokens,
    reasoning: "none",
    // Bedrock ignores portable reasoning for OpenAI models; their default effort
    // is not none.
    ...(params.model.adapter === LLMAdapter.Bedrock &&
    params.model.model.includes("openai.")
      ? {
          providerOptions: {
            bedrock: {
              additionalModelRequestFields: { reasoning: { effort: "none" } },
            },
          },
        }
      : {}),
    // The AI SDK retries 429 and 5xx responses with exponential backoff.
    maxRetries: 2,
    timeout: 60_000,
  });
}
