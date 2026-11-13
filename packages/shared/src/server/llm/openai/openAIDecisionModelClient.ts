import { createOpenAI } from "@ai-sdk/openai";
import { APICallError } from "ai";
import type { DecisionModelClient } from "../../evals/decisionModelEvaluatorExecution";
import { createSecureLlmFetch } from "../secureLlmFetch";
import { createTextAdapterDecisionModelClient } from "../textAdapterDecisionModelClient";

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
  fetchImpl?: typeof fetch;
}): DecisionModelClient {
  const provider = createOpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL ?? undefined,
    headers: params.extraHeaders,
    fetch:
      params.fetchImpl ??
      createSecureLlmFetch({
        logContext: "OpenAI decision model",
        additionalSensitiveHeaders: Object.keys(params.extraHeaders ?? {}),
      }),
  });

  return createTextAdapterDecisionModelClient({
    model: provider.decisionModel(params.model),
    providerName: "OpenAI",
    providerMetadataKey: "openai",
    mapError: explainMissingDecisionsEndpoint,
  });
}
