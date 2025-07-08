import {
  ChatMessage,
  decryptAndParseExtraHeaders,
  fetchLLMCompletion,
  logger,
  type TraceParams,
} from "@langfuse/shared/src/server";
import { ApiError, LLMApiKeySchema, ZodModelConfig } from "@langfuse/shared";
import { z } from "zod/v4";
import { z as zodV3 } from "zod/v3";
import { ZodSchema as ZodV3Schema } from "zod/v3";
import { decrypt } from "@langfuse/shared/encryption";
import { tokenCount } from "../tokenisation/usage";
import Handlebars from "handlebars";

/**
 * Standard error handling for LLM operations
 * Handles common LLM errors like quota limits and throttling with appropriate status codes
 *
 * @param operation - The async LLM operation to execute
 * @param operationName - Name for error context (e.g., "call LLM")
 * @returns The result of the operation or throws an ApiError
 */
async function withLLMErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string = "LLM operation",
): Promise<T> {
  try {
    return await operation();
  } catch (e) {
    // Handle specific LLM provider errors with appropriate status codes
    if (
      e instanceof Error &&
      (e.name === "InsufficientQuotaError" || e.name === "ThrottlingException")
    ) {
      throw new ApiError(e.name, 429);
    }

    // Handle all other errors with preserved status codes
    throw new ApiError(
      `Failed to ${operationName}: ${e}`,
      (e as any)?.response?.status ?? (e as any)?.status,
    );
  }
}

export async function callStructuredLLM<T extends ZodV3Schema>(
  jeId: string,
  llmApiKey: z.infer<typeof LLMApiKeySchema>,
  messages: ChatMessage[],
  modelParams: z.infer<typeof ZodModelConfig>,
  provider: string,
  model: string,
  structuredOutputSchema: T,
): Promise<zodV3.infer<T>> {
  return withLLMErrorHandling(async () => {
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
  }, "call LLM");
}

export async function callLLM(
  llmApiKey: z.infer<typeof LLMApiKeySchema>,
  messages: ChatMessage[],
  modelParams: z.infer<typeof ZodModelConfig>,
  provider: string,
  model: string,
  traceParams?: Omit<TraceParams, "tokenCountDelegate">,
): Promise<string> {
  return withLLMErrorHandling(async () => {
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
  }, "call LLM");
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
