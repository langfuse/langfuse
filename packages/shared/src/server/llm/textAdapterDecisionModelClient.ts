import {
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
} from "../evals/decisionModelEvaluatorExecution";
import type { DecisionModelEntry } from "../../features/evals/decisionModel";

/**
 * Decision client for text adapters with a native decisions endpoint (OpenAI,
 * Google AI Studio). Both take one text `input` and plain-text questions.
 */
export function createTextAdapterDecisionModelClient(params: {
  model: Parameters<typeof decide>[0]["model"];
  providerName: string;
  providerMetadataKey: string;
  mapError?: (error: unknown) => unknown;
}): DecisionModelClient {
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
          model: params.model,
          state: JSON.stringify(request.state),
          questions,
          maxRetries: 0,
        });
      } catch (error) {
        if (Experimental_DecisionRefusalError.isInstance(error)) {
          throw new DecisionModelEvaluatorError(
            `${params.providerName} declined to answer: ${error.questionIds.join(", ")}.`,
          );
        }
        throw params.mapError ? params.mapError(error) : error;
      }

      const confidenceById = readConfidence(
        result.providerMetadata,
        params.providerMetadataKey,
      );
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

/** Same text conversion the provider SDKs apply before POST /decisions. */
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

function readConfidence(
  providerMetadata: unknown,
  providerMetadataKey: string,
): Record<string, number> {
  if (typeof providerMetadata !== "object" || providerMetadata === null) {
    return {};
  }
  const metadata = (providerMetadata as Record<string, unknown>)[
    providerMetadataKey
  ];
  if (typeof metadata !== "object" || metadata === null) return {};
  const confidence = (metadata as Record<string, unknown>).confidence;
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
