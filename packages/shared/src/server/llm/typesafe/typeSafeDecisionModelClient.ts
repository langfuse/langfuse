import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import {
  experimental_decide as decide,
  type Experimental_DecisionQuestion,
  type JSONValue,
} from "ai";
import type {
  DecisionModelAnswer,
  DecisionModelClient,
  DecisionModelEvaluation,
  DecisionModelRequestQuestion,
} from "../../evals/decisionModelEvaluatorExecution";
import { createSecureLlmFetch } from "../secureLlmFetch";

/** TypeSafe reads a description per level, in order. */
function toTypeSafeQuestion(question: DecisionModelRequestQuestion) {
  switch (question.type) {
    case "choice":
      return {
        type: "choice" as const,
        instructions: question.instructions,
        criteria: Object.fromEntries(
          question.choices.map((choice) => [
            choice.value,
            choice.description ?? null,
          ]),
        ),
      };
    case "score":
      return {
        type: "score" as const,
        instructions: question.instructions,
        criteria: question.levels.map((level) => level.description),
      };
    case "predicate":
      return {
        type: "boolean" as const,
        instructions: question.instructions,
        ...(question.criteria
          ? {
              criteria: {
                true: question.criteria.true ?? null,
                false: question.criteria.false ?? null,
              },
            }
          : {}),
      };
  }
}

export function createTypeSafeDecisionModelClient(params: {
  apiKey: string;
  model: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): DecisionModelClient {
  const provider = createTypeSafeAi({
    apiKey: params.apiKey,
    baseURL: params.baseURL ?? undefined,
    headers: params.extraHeaders,
    fetch:
      params.fetchImpl ??
      createSecureLlmFetch({
        logContext: "TypeSafe decision model",
        additionalSensitiveHeaders: Object.keys(params.extraHeaders ?? {}),
      }),
  });
  const model = provider.evaluationModel(params.model);

  return {
    evaluate: async (request) => {
      const result = await decide({
        model,
        state: request.state as Record<string, JSONValue>,
        questions: Object.fromEntries(
          Object.entries(request.questions).map(([id, question]) => [
            id,
            toTypeSafeQuestion(question),
          ]),
        ) as Record<string, Experimental_DecisionQuestion>,
        maxRetries: 1,
      });

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
        typeof value === "number" && value >= 0 && value <= 1
          ? [[id, value]]
          : [],
    ),
  );
}
