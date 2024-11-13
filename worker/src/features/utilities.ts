import {
  ChatMessage,
  fetchLLMCompletion,
  logger,
} from "@langfuse/shared/src/server";
import { ApiError, LLMApiKeySchema, ZodModelConfig } from "@langfuse/shared";
import { z, ZodSchema } from "zod";
import { decrypt } from "@langfuse/shared/encryption";

export async function callLLM<T extends ZodSchema>(
  jeId: string,
  llmApiKey: z.infer<typeof LLMApiKeySchema>,
  messages: ChatMessage[],
  modelParams: z.infer<typeof ZodModelConfig>,
  provider: string,
  model: string,
  structuredOutputSchema: T,
): Promise<z.infer<T>> {
  try {
    const completion = await fetchLLMCompletion({
      streaming: false,
      apiKey: decrypt(llmApiKey.secretKey), // decrypt the secret key
      baseURL: llmApiKey.baseURL || undefined,
      messages,
      modelParams: {
        provider,
        model,
        adapter: llmApiKey.adapter,
        ...modelParams,
      },
      structuredOutputSchema,
      config: llmApiKey.config,
    });
    return structuredOutputSchema.parse(completion);
  } catch (e) {
    logger.error(`Job ${jeId} failed to call LLM. Eval will fail. ${e}`);
    throw new ApiError(`Failed to call LLM: ${e}`);
  }
}