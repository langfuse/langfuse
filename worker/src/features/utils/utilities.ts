import {
  ChatMessage,
  fetchLLMCompletion,
  LLMJSONSchema,
  logger,
  TraceSinkParams,
} from "@langfuse/shared/src/server";
import { ApiError, LLMApiKeySchema, ZodModelConfig } from "@langfuse/shared";
import { z } from "zod/v4";
import { ZodSchema as ZodV3Schema } from "zod/v3";
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

export async function callLLM(params: {
  llmApiKey: z.infer<typeof LLMApiKeySchema>;
  messages: ChatMessage[];
  modelParams: z.infer<typeof ZodModelConfig>;
  provider: string;
  model: string;
  traceSinkParams?: TraceSinkParams;
  structuredOutputSchema?: ZodV3Schema | LLMJSONSchema;
  throwOnError?: boolean;
}): Promise<unknown> {
  const {
    llmApiKey,
    messages,
    modelParams,
    provider,
    model,
    traceSinkParams,
    structuredOutputSchema,
    throwOnError,
  } = params;

  return withLLMErrorHandling(async () => {
    const { completion, processTracedEvents } = await fetchLLMCompletion({
      streaming: false,
      llmConnection: llmApiKey,
      messages,
      modelParams: {
        provider,
        model,
        adapter: llmApiKey.adapter,
        ...modelParams,
      },
      ...(structuredOutputSchema && { structuredOutputSchema }),
      traceSinkParams,
      maxRetries: 1,
      throwOnError,
    });

    if (traceSinkParams) {
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
