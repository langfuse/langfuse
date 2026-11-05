import { createOpenAI } from "@ai-sdk/openai";
import {
  APICallError,
  experimental_decide as decide,
  Experimental_DecisionRefusalError,
  type Experimental_DecisionQuestion,
} from "ai";
import {
  DecisionModelEvaluatorError,
  type DecisionModelAnswer,
  type DecisionModelClient,
  type DecisionModelEvaluation,
  type DecisionModelRequest,
  type DecisionModelRequestQuestion,
} from "../../evals/decisionModelEvaluatorExecution";
import type { DecisionModelEntry } from "../../../features/evals/decisionModel";
import { createSecureLlmFetch } from "../secureLlmFetch";

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

/** Same text conversion the OpenAI SDK applies before POST /v1/decisions. */
function toDecisionText(entry: DecisionModelEntry): string {
  return typeof entry === "string" ? entry : JSON.stringify(entry);
}

/** The SDK's score question has descriptions only. It sends index labels. */
function toSdkQuestion(
  question: DecisionModelRequestQuestion,
): Experimental_DecisionQuestion {
  switch (question.type) {
    case "choice":
      return {
        type: "choice",
        instructions: toDecisionText(question.instructions),
        criteria: Object.fromEntries(
          question.choices.map((choice) => [
            choice.value,
            choice.description == null
              ? null
              : toDecisionText(choice.description),
          ]),
        ),
      };
    case "score":
      return {
        type: "score",
        instructions: toDecisionText(question.instructions),
        criteria: question.levels.map((level) =>
          toDecisionText(level.description),
        ),
      };
    case "predicate": {
      const criteria = {
        ...(question.criteria?.true != null
          ? { true: toDecisionText(question.criteria.true) }
          : {}),
        ...(question.criteria?.false != null
          ? { false: toDecisionText(question.criteria.false) }
          : {}),
      };
      return {
        type: "boolean",
        instructions: toDecisionText(question.instructions),
        ...(Object.keys(criteria).length > 0 ? { criteria } : {}),
      };
    }
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
      const questions: Record<string, Experimental_DecisionQuestion> =
        Object.fromEntries(
          Object.entries(request.questions).map(([id, question]) => [
            id,
            toSdkQuestion(question),
          ]),
        );
      let result;
      try {
        result = await decide({
          model: provider.decisionModel(params.model),
          state: JSON.stringify(request.state),
          questions,
          maxRetries: 0,
        });
      } catch (error) {
        if (Experimental_DecisionRefusalError.isInstance(error)) {
          throw new DecisionModelEvaluatorError(
            `OpenAI declined to answer: ${error.questionIds.join(", ")}.`,
          );
        }
        throw explainMissingDecisionsEndpoint(error);
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
