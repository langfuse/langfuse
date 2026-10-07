import { createOpenAI } from "@ai-sdk/openai";
import {
  experimental_decide as decide,
  Experimental_DecisionRefusalError,
  type Experimental_DecisionQuestion,
  type JSONValue,
} from "ai";
import {
  DecisionModelEvaluatorError,
  type DecisionModelAnswer,
  type DecisionModelClient,
  type DecisionModelEvaluation,
  type DecisionModelRequest,
  type DecisionModelRequestQuestion,
} from "../../evals/decisionModelEvaluatorExecution";
import { createSecureLlmFetch } from "../secureLlmFetch";

/** The SDK's score question has descriptions only. It sends index labels. */
function toSdkQuestion(id: string, question: DecisionModelRequestQuestion) {
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
        criteria: question.levels.map((level, index) => {
          if (!level.label) {
            throw new DecisionModelEvaluatorError(
              `OpenAI score question "${id}" is missing a label for level ${index}.`,
            );
          }
          return level.description ?? level.label;
        }),
      };
    case "predicate":
      return {
        type: "boolean" as const,
        instructions: question.instructions,
      };
  }
}

function readConfidence(providerMetadata: unknown): Record<string, number> {
  if (typeof providerMetadata !== "object" || providerMetadata === null) {
    return {};
  }
  const openai = (providerMetadata as Record<string, unknown>).openai;
  if (typeof openai !== "object" || openai === null) return {};
  const confidence = (openai as Record<string, unknown>).confidence;
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

  return {
    evaluate: async (request: DecisionModelRequest) => {
      const questions = Object.fromEntries(
        Object.entries(request.questions).map(([id, question]) => [
          id,
          toSdkQuestion(id, question),
        ]),
      );
      let result;
      try {
        result = await decide({
          model: provider.decisionModel(params.model),
          state: request.state as Record<string, JSONValue>,
          questions: questions as Record<string, Experimental_DecisionQuestion>,
          maxRetries: 0,
        });
      } catch (error) {
        if (Experimental_DecisionRefusalError.isInstance(error)) {
          throw new DecisionModelEvaluatorError(
            `OpenAI declined to answer: ${error.questionIds.join(", ")}.`,
          );
        }
        throw error;
      }

      const confidenceById = readConfidence(result.providerMetadata);
      const answers: Record<string, DecisionModelAnswer> = {};
      for (const [id, answer] of Object.entries(result.answers)) {
        switch (answer.type) {
          case "choice":
            answers[id] = {
              type: "choice",
              choice: answer.choice,
              probabilities: answer.probabilities ?? { [answer.choice]: 1 },
              confidence: confidenceById[id] ?? null,
            };
            break;
          case "score":
            answers[id] = {
              type: "score",
              score: answer.score,
              probabilities: answer.probabilities ?? {},
              confidence: confidenceById[id] ?? null,
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
