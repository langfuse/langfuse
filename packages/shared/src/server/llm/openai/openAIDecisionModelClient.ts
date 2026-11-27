import { createOpenAI } from "@ai-sdk/openai";
import { APICallError } from "ai";
import type { DecisionModelClient } from "../../evals/decisionModelEvaluatorExecution";
import { wrapFetchWithOpenRouterInternalTraceProvenance } from "../ai-sdk/openRouterProvenance";
import { createSecureLlmFetch } from "../secureLlmFetch";
import { createTextAdapterDecisionModelClient } from "../textAdapterDecisionModelClient";
import type { LangfuseInternalTraceEnvironment } from "../types";

/**
 * Proxies and gateways without POST /decisions answer 404 with a body the
 * OpenAI SDK cannot parse, which leaves only the status text "Not Found".
 * OpenAI's own 404s (for example `model_not_found`) carry parsed `data` and
 * keep their message. The result stays a 404 APICallError so evaluator error
 * classification is unchanged.
 */
function explainMissingDecisionsEndpoint(error: unknown): unknown {
  if (
    !APICallError.isInstance(error) ||
    error.statusCode !== 404 ||
    error.data !== undefined
  ) {
    return error;
  }
  return new APICallError({
    message:
      `The decision-model endpoint was not found (POST ${error.url.split("?")[0]} returned 404). ` +
      "Check that the connection's base URL supports OpenAI's /decisions endpoint, " +
      "for example the default https://api.openai.com/v1.",
    url: error.url,
    requestBodyValues: error.requestBodyValues,
    statusCode: error.statusCode,
    responseHeaders: error.responseHeaders,
    responseBody: error.responseBody,
    isRetryable: error.isRetryable,
    cause: error,
  });
}

export function createOpenAIDecisionModelClient(params: {
  apiKey: string;
  model: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  internalEnvironment?: LangfuseInternalTraceEnvironment;
  fetchImpl?: typeof fetch;
}): DecisionModelClient {
  const fetchImpl = wrapFetchWithOpenRouterInternalTraceProvenance({
    fetchImpl:
      params.fetchImpl ??
      createSecureLlmFetch({
        logContext: "OpenAI decision model",
        additionalSensitiveHeaders: Object.keys(params.extraHeaders ?? {}),
      }),
    baseURL: params.baseURL,
    internalEnvironment: params.internalEnvironment,
  });
  const provider = createOpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL ?? undefined,
    headers: params.extraHeaders,
    fetch: fetchImpl,
  });

  return createTextAdapterDecisionModelClient({
    model: provider.decisionModel(params.model),
    providerName: "OpenAI",
    providerMetadataKey: "openai",
    mapError: explainMissingDecisionsEndpoint,
  });
}
