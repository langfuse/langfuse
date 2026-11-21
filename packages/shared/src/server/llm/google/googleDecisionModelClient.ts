import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { DecisionModelClient } from "../../evals/decisionModelEvaluatorExecution";
import {
  GOOGLE_API_KEY_HEADER,
  toGoogleAIStudioBaseURL,
} from "../ai-sdk/providers/google";
import { createSecureLlmFetch } from "../secureLlmFetch";
import { createTextAdapterDecisionModelClient } from "../textAdapterDecisionModelClient";

export function createGoogleDecisionModelClient(params: {
  apiKey: string;
  model: string;
  baseURL?: string | null;
  fetchImpl?: typeof fetch;
}): DecisionModelClient {
  // Like Google AI Studio text calls, extra headers are not sent; only the API
  // key header belongs on this request path.
  const provider = createGoogleGenerativeAI({
    apiKey: params.apiKey,
    baseURL: toGoogleAIStudioBaseURL(params.baseURL),
    fetch:
      params.fetchImpl ??
      createSecureLlmFetch({
        logContext: "Google decision model",
        additionalSensitiveHeaders: [GOOGLE_API_KEY_HEADER],
      }),
  });

  return createTextAdapterDecisionModelClient({
    model: provider.decisionModel(params.model),
    providerName: "Google",
    providerMetadataKey: "google",
  });
}
