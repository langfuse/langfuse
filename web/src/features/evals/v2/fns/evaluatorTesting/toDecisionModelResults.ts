import type { DecisionModelQuestionResult } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelResultView/DecisionModelResultView";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toProbabilities = (value: unknown): Record<string, number> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      )
    : {};

/**
 * Reads the scores of a decision-model test run into one row per question.
 * Values come from the score itself; distributions and confidence from the
 * `typesafe` metadata namespace the executor writes; the question text from
 * the request that was sent.
 */
export function toDecisionModelResults(
  response: Record<string, unknown>,
): DecisionModelQuestionResult[] {
  const scores = Array.isArray(response.scores) ? response.scores : [];
  const requestQuestions =
    isRecord(response.request) && isRecord(response.request.questions)
      ? response.request.questions
      : {};

  return scores.flatMap((score, index): DecisionModelQuestionResult[] => {
    if (!isRecord(score)) return [];
    const typesafe = isRecord(score.metadata) ? score.metadata.typesafe : null;
    if (!isRecord(typesafe)) return [];

    const questionId = String(typesafe.questionId ?? index);
    const question = requestQuestions[questionId];
    const common = {
      questionId,
      scoreName: String(score.name ?? questionId),
      instructions:
        isRecord(question) && typeof question.instructions === "string"
          ? question.instructions
          : "",
    };
    const confidence =
      typeof typesafe.confidence === "number" ? typesafe.confidence : null;

    switch (typesafe.type) {
      case "choice":
        return [
          {
            ...common,
            type: "choice",
            choice: String(score.value ?? typesafe.choice ?? ""),
            probabilities: toProbabilities(typesafe.probabilities),
            confidence,
          },
        ];
      case "score": {
        const legend = isRecord(typesafe.legend) ? typesafe.legend : {};
        return [
          {
            ...common,
            type: "score",
            score: Number(score.value ?? 0),
            levels: Object.keys(legend)
              .sort((a, b) => Number(a) - Number(b))
              .map((level) => String(legend[level] ?? "")),
            probabilities: toProbabilities(typesafe.probabilities),
            confidence,
          },
        ];
      }
      case "noul":
        return [
          { ...common, type: "noul", probability: Number(score.value ?? 0) },
        ];
      default:
        return [];
    }
  });
}
