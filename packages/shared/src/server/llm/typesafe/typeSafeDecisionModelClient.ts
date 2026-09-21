import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import {
  experimental_evaluate as evaluate,
  type Experimental_EvaluationQuestion as EvaluationQuestion,
  type JSONValue,
} from "ai";
import type {
  DecisionModelAnswer,
  DecisionModelClient,
  DecisionModelEvaluation,
} from "../../evals/decisionModelEvaluatorExecution";
import { createSecureLlmFetch } from "../secureLlmFetch";

/**
 * TypeSafe connections have no custom base URL: the AI SDK provider always
 * talks to the public API, so a connection is only an API key. Failures
 * surface as AI SDK `APICallError`s and flow through the same evaluator error
 * policy as LLM-as-a-judge calls. The SDK validates every answer against its
 * question (known options, normalized distributions, argmax choice).
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
    evaluate: async (request) => {
      const result = await evaluate({
        model,
        // Extracted observation fields are parsed JSON, so the state is
        // JSON-serializable; the request questions already use JSON entries.
        state: request.state as Record<string, JSONValue>,
        questions: request.questions as Record<string, EvaluationQuestion>,
        maxRetries: 1,
      });

      // The SDK moves TypeSafe's confidence out of the answers into provider
      // metadata; read it back so the score metadata keeps both axes.
      const confidenceById = readConfidence(result.providerMetadata);

      const answers: Record<string, DecisionModelAnswer> = {};
      for (const [id, answer] of Object.entries(result.answers)) {
        const confidence = confidenceById[id] ?? null;
        switch (answer.type) {
          case "choice":
            answers[id] = {
              type: "choice",
              choice: answer.choice,
              probabilities: answer.probabilities ?? { [answer.choice]: 1 },
              confidence,
            };
            break;
          case "score":
            answers[id] = {
              type: "score",
              score: answer.score,
              probabilities: answer.probabilities ?? {},
              confidence,
            };
            break;
          case "boolean":
            answers[id] = { type: "boolean", probability: answer.probability };
            break;
        }
      }

      const evaluation: DecisionModelEvaluation = {
        model: result.response.modelId,
        answers,
        usage: {
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
        },
      };
      return evaluation;
    },
  };
}

function readConfidence(providerMetadata: unknown): Record<string, number> {
  if (typeof providerMetadata !== "object" || providerMetadata === null) {
    return {};
  }
  const typesafe = (providerMetadata as Record<string, unknown>).typesafe;
  if (typeof typesafe !== "object" || typesafe === null) return {};
  const confidence = (typesafe as Record<string, unknown>).confidence;
  if (typeof confidence !== "object" || confidence === null) return {};
  return Object.fromEntries(
    Object.entries(confidence as Record<string, unknown>).flatMap(
      ([id, value]) =>
        // Confidence is not part of the SDK's validated answer; range-check it.
        typeof value === "number" && value >= 0 && value <= 1
          ? [[id, value]]
          : [],
    ),
  );
}
