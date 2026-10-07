import {
  DecisionModelEvaluatorError,
  type DecisionModelClient,
} from "../evals/decisionModelEvaluatorExecution";
import {
  isAllowedDecisionModel,
  LLMAdapter,
  OPENAI_DECISION_MODEL_IDS,
} from "./types";
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
      params.adapter === LLMAdapter.OpenAI
        ? `Model "${params.model}" is not supported for decision models. Use ${OPENAI_DECISION_MODEL_IDS.join(", ")}.`
        : `Decision-model adapter is not supported: ${params.adapter}`,
    );
  }
  if (params.adapter === LLMAdapter.OpenAI) {
    return createOpenAIDecisionModelClient(params);
  }
  return createTypeSafeDecisionModelClient(params);
}
