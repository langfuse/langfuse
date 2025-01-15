import {
  ChatMessage,
  fetchLLMCompletion,
  logger,
  type TraceParams,
} from "@langfuse/shared/src/server";
import { ApiError, LLMApiKeySchema, ZodModelConfig } from "@langfuse/shared";
import { z, ZodSchema } from "zod";
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
  traceParams?: Omit<TraceParams, "tokenCountDelegate">,
): Promise<z.infer<T>> {
  try {
    const { completion, processTracedEvents } = await fetchLLMCompletion({
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
      traceParams: traceParams
        ? { ...traceParams, tokenCountDelegate: tokenCount }
        : undefined,
      maxRetries: 1,
    });

    if (traceParams) {
      await processTracedEvents();
    }

    return structuredOutputSchema.parse(completion);
  } catch (e) {
    logger.error(`Job ${jeId} failed to call LLM. Eval will fail.`, e);
    throw new ApiError(
      `Failed to call LLM: ${e}`,
      (e as any)?.response?.status ?? (e as any)?.status,
    );
  }
}

export async function callLLM(
  jeId: string,
  llmApiKey: z.infer<typeof LLMApiKeySchema>,
  messages: ChatMessage[],
  modelParams: z.infer<typeof ZodModelConfig>,
  provider: string,
  model: string,
  traceParams?: Omit<TraceParams, "tokenCountDelegate">,
): Promise<string> {
  try {
    const { completion, processTracedEvents } = await fetchLLMCompletion({
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
      config: llmApiKey.config,
      traceParams: traceParams
        ? { ...traceParams, tokenCountDelegate: tokenCount }
        : undefined,
      maxRetries: 1,
    });

    if (traceParams) {
      await processTracedEvents();
    }

    return completion;
  } catch (e) {
    logger.error(`Job ${jeId} failed to call LLM. Eval will fail.`, e);
    throw new ApiError(
      `Failed to call LLM: ${e}`,
      (e as any)?.response?.status ?? (e as any)?.status,
    );
  }
}

export function compileHandlebarString(
  handlebarString: string,
  context: Record<string, any>,
): string {
  const template = Handlebars.compile(handlebarString);
  return template(context);
}
