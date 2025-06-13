import {
  ChatMessage,
  decryptAndParseExtraHeaders,
  fetchLLMCompletion,
  logger,
  type TraceParams,
} from "@langfuse/shared/src/server";
import { ApiError, LLMApiKeySchema, ZodModelConfig } from "@langfuse/shared";
import { z } from "zod/v4";
// We continue to use zod v3 for langchainjs.
// Corresponding issue report: https://github.com/langchain-ai/langchainjs/issues/8357.
import { z as zv3, ZodSchema } from "zod";
import { decrypt } from "@langfuse/shared/encryption";
import { tokenCount } from "./tokenisation/usage";
import Handlebars from "handlebars";

export async function callStructuredLLM<T extends ZodSchema>(
  jeId: string,
  llmApiKey: z.infer<typeof LLMApiKeySchema>,
  messages: ChatMessage[],
  modelParams: z.infer<typeof ZodModelConfig>,
  provider: string,
  model: string,
  structuredOutputSchema: T,
): Promise<zv3.infer<T>> {
  try {
    const { completion } = await fetchLLMCompletion({
      streaming: false,
      apiKey: decrypt(llmApiKey.secretKey), // decrypt the secret key
      extraHeaders: decryptAndParseExtraHeaders(llmApiKey.extraHeaders),
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
      maxRetries: 1,
    });

    return structuredOutputSchema.parse(completion);
  } catch (e) {
    if (
      e instanceof Error &&
      (e.name === "InsufficientQuotaError" || e.name === "ThrottlingException")
    ) {
      throw new ApiError(e.name, 429);
    }

    throw new ApiError(
      `Failed to call LLM: ${e}`,
      (e as any)?.response?.status ?? (e as any)?.status,
    );
  }
}

export async function callLLM(
  llmApiKey: z.infer<typeof LLMApiKeySchema>,
  messages: ChatMessage[],
  modelParams: z.infer<typeof ZodModelConfig>,
  provider: string,
  model: string,
  traceParams?: Omit<TraceParams, "tokenCountDelegate">,
): Promise<string> {
  const { completion, processTracedEvents } = await fetchLLMCompletion({
    streaming: false,
    apiKey: decrypt(llmApiKey.secretKey),
    extraHeaders: decryptAndParseExtraHeaders(llmApiKey.extraHeaders),
    baseURL: llmApiKey.baseURL || undefined,
    messages,
    modelParams: {
      provider,
      model,
      adapter: llmApiKey.adapter,
      ...modelParams,
    },
    config: llmApiKey.config,
    traceParams: traceParams
      ? { ...traceParams, tokenCountDelegate: tokenCount }
      : undefined,
    maxRetries: 1,
    throwOnError: false,
  });

  if (traceParams) {
    await processTracedEvents();
  }

  return completion;
}

export function compileHandlebarString(
  handlebarString: string,
  context: Record<string, any>,
): string {
  try {
    const template = Handlebars.compile(handlebarString, { noEscape: true });
    return template(context);
  } catch (error) {
    logger.info("Handlebars compilation error:", error);
    return handlebarString; // Fallback to the original string if Handlebars fails
  }
}
