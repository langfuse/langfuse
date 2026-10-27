import { z } from "zod";

import { trimTrailingSlashes } from "./ai-sdk/providers/utils";
import { LLMValidationError } from "./errors";
import { getClientInitiatedNonStreamingLlmTimeoutMs } from "./llmText";
import { createSecureLlmFetch } from "./secureLlmFetch";

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const MAX_LISTED_MODELS = 1000;

// API contract: https://platform.openai.com/docs/api-reference/models/list
// OpenAI-compatible gateways often return only `id`, so nothing else is required.
const responseSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1) })),
});

export type ListOpenAIConnectionModelsResult =
  | { success: true; models: string[] }
  | { success: false; error: string };

/**
 * Lists the model ids an OpenAI-compatible endpoint serves (`GET {baseURL}/models`),
 * through the same SSRF-guarded fetch as LLM calls on the connection.
 */
export async function listOpenAIConnectionModels(params: {
  secretKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<ListOpenAIConnectionModelsResult> {
  if (params.baseURL?.includes("{model}")) {
    return {
      success: false,
      error:
        "Models cannot be listed for a base URL that contains {model}: each model has its own endpoint.",
    };
  }

  const fetchImpl =
    params.fetchImpl ??
    createSecureLlmFetch({
      logContext: "LLM connection model listing",
      additionalSensitiveHeaders: Object.keys(params.extraHeaders ?? {}),
    });
  const url = `${trimTrailingSlashes(params.baseURL || OPENAI_DEFAULT_BASE_URL)}/models`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        ...params.extraHeaders,
        Authorization: `Bearer ${params.secretKey}`,
      },
      signal: AbortSignal.timeout(getClientInitiatedNonStreamingLlmTimeoutMs()),
    });
  } catch (error) {
    if (LLMValidationError.isInstance(error)) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: `Could not reach ${url}: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      success: false,
      error: `The endpoint rejected the API key (HTTP ${response.status}).`,
    };
  }
  if (response.status === 404) {
    return {
      success: false,
      error: `The endpoint does not serve ${url} (HTTP 404).`,
    };
  }
  if (!response.ok) {
    return {
      success: false,
      error: `The endpoint returned HTTP ${response.status} for ${url}.`,
    };
  }

  const parsed = responseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) {
    return {
      success: false,
      error: `The endpoint did not return an OpenAI model list ({ "data": [{ "id": ... }] }).`,
    };
  }

  const models = Array.from(new Set(parsed.data.data.map((model) => model.id)))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_LISTED_MODELS);
  return { success: true, models };
}
