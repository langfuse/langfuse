import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { experimental_evaluate as evaluate, type JSONValue } from "ai";
import type {
  DecisionModelClient,
  DecisionModelEvaluation,
} from "../../evals/decisionModelEvaluatorExecution";
import { createSecureLlmFetch } from "../secureLlmFetch";

const QUESTION_ID = "verdict";

/**
 * TypeSafe connections have no custom base URL: the AI SDK provider always
 * talks to the public API, so a connection is only an API key. Failures
 * surface as AI SDK `APICallError`s and flow through the same evaluator error
 * policy as LLM-as-a-judge calls.
 */
export function createTypeSafeDecisionModelClient(params: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): DecisionModelClient {
  const provider = createTypeSafeAi({
    apiKey: params.apiKey,
    fetch:
      params.fetchImpl ??
      createSecureLlmFetch({ logContext: "TypeSafe decision model" }),
  });
  const model = provider.evaluationModel(params.model);

  return {
    evaluateChoice: async ({ state, question }) => {
      const result = await evaluate({
        model,
        // Observation fields are parsed JSON, so the state is JSON-serializable.
        state: state as Record<string, JSONValue>,
        questions: { [QUESTION_ID]: question },
        maxRetries: 1,
      });

      const answer = result.answers[QUESTION_ID];
      // The SDK moves TypeSafe's confidence out of the answer into provider
      // metadata; read it back so the score metadata keeps both axes.
      const confidence = readConfidence(result.providerMetadata);

      const evaluation: DecisionModelEvaluation = {
        model: result.response.modelId,
        answer: {
          type: "choice",
          choice: answer.choice,
          probabilities: answer.probabilities ?? { [answer.choice]: 1 },
          confidence,
        },
        usage: {
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
        },
      };
      return evaluation;
    },
  };
}

function readConfidence(providerMetadata: unknown): number | null {
  if (typeof providerMetadata !== "object" || providerMetadata === null) {
    return null;
  }
  const typesafe = (providerMetadata as Record<string, unknown>).typesafe;
  if (typeof typesafe !== "object" || typesafe === null) return null;
  const confidence = (typesafe as Record<string, unknown>).confidence;
  if (typeof confidence !== "object" || confidence === null) return null;
  const value = (confidence as Record<string, unknown>)[QUESTION_ID];
  return typeof value === "number" ? value : null;
}
