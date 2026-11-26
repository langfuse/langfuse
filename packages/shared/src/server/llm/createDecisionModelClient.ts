import {
  DecisionModelEvaluatorError,
  type DecisionModelClient,
} from "../evals/decisionModelEvaluatorExecution";
import {
  isAllowedDecisionModel,
  LLMAdapter,
  unsupportedDecisionModelMessage,
} from "./types";
import { createGoogleDecisionModelClient } from "./google/googleDecisionModelClient";
import { createOpenAIDecisionModelClient } from "./openai/openAIDecisionModelClient";
import { createTypeSafeDecisionModelClient } from "./typesafe/typeSafeDecisionModelClient";

export function createDecisionModelClient(params: {
  adapter: string;
  apiKey: string;
  model: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): DecisionModelClient {
  if (!isAllowedDecisionModel(params.adapter, params.model)) {
    throw new DecisionModelEvaluatorError(
      unsupportedDecisionModelMessage(params.adapter, params.model) ??
        `Decision-model adapter is not supported: ${params.adapter}`,
    );
  }
  if (params.adapter === LLMAdapter.OpenAI) {
    return createOpenAIDecisionModelClient(params);
  }
  if (params.adapter === LLMAdapter.GoogleAIStudio) {
    return createGoogleDecisionModelClient(params);
  }
  return createTypeSafeDecisionModelClient(params);
}
