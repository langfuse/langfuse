import { z } from "zod";

const scoreName = z.string().trim().min(1).max(200);

const NumericScoreResultPredicateSchema = z.object({
  scoreName,
  dataType: z.literal("NUMERIC"),
  operator: z.enum(["=", "!=", ">", ">=", "<", "<="]),
  value: z.number(),
});

const BooleanScoreResultPredicateSchema = z.object({
  scoreName,
  dataType: z.literal("BOOLEAN"),
  operator: z.literal("="),
  value: z.boolean(),
});

const StringScoreResultPredicateSchema = z.object({
  scoreName,
  dataType: z.enum(["CATEGORICAL", "TEXT"]),
  operator: z.enum(["=", "!="]),
  value: z.string().max(500),
});

export const ScoreResultPredicateSchema = z.discriminatedUnion("dataType", [
  NumericScoreResultPredicateSchema,
  BooleanScoreResultPredicateSchema,
  StringScoreResultPredicateSchema,
]);

export const ScoreResultTriggerSchema = z.object({
  evaluatorId: z.string().min(1),
  predicates: z.array(ScoreResultPredicateSchema).min(1).max(20),
});

export type ScoreResultTrigger = z.infer<typeof ScoreResultTriggerSchema>;
type ScoreResultPredicate = z.infer<typeof ScoreResultPredicateSchema>;
type CategoricalScoreResultPredicate = Extract<
  ScoreResultPredicate,
  { value: string }
> & { dataType: "CATEGORICAL" };

type EvaluatorScore = {
  name: string;
  dataType?: string;
  value: string | number;
};

export function matchesScoreResultTrigger(
  trigger: ScoreResultTrigger,
  scores: EvaluatorScore[],
): boolean {
  const predicatesByScoreName = Map.groupBy(
    trigger.predicates,
    (predicate) => predicate.scoreName,
  );

  return [...predicatesByScoreName].every(([name, predicates]) => {
    const namedScores = scores.filter((score) => score.name === name);
    const categoricalPredicates = predicates.filter(
      (predicate): predicate is CategoricalScoreResultPredicate =>
        predicate.dataType === "CATEGORICAL",
    );
    const perScorePredicates = predicates.filter(
      (predicate) => predicate.dataType !== "CATEGORICAL",
    );

    return (
      matchesCategoricalPredicates(categoricalPredicates, namedScores) &&
      (perScorePredicates.length === 0 ||
        namedScores.some((score) =>
          perScorePredicates.every((predicate) =>
            matchesPredicate(predicate, score),
          ),
        ))
    );
  });
}

function matchesCategoricalPredicates(
  predicates: CategoricalScoreResultPredicate[],
  scores: EvaluatorScore[],
) {
  if (predicates.length === 0) return true;
  const values = new Set(
    scores.flatMap((score) => {
      const dataType =
        score.dataType ??
        (typeof score.value === "string" ? "CATEGORICAL" : "NUMERIC");
      return dataType === "CATEGORICAL" && typeof score.value === "string"
        ? [score.value]
        : [];
    }),
  );
  if (values.size === 0) return false;

  return predicates.every((predicate) =>
    predicate.operator === "="
      ? values.has(predicate.value)
      : !values.has(predicate.value),
  );
}

function matchesPredicate(
  predicate: z.infer<typeof ScoreResultPredicateSchema>,
  score: EvaluatorScore,
) {
  const scoreDataType =
    score.dataType ??
    (typeof score.value === "number" ? "NUMERIC" : "CATEGORICAL");
  if (scoreDataType !== predicate.dataType) return false;

  switch (predicate.dataType) {
    case "BOOLEAN":
      return score.value === (predicate.value ? 1 : 0);
    case "CATEGORICAL":
    case "TEXT":
      if (typeof score.value !== "string") return false;
      return predicate.operator === "="
        ? score.value === predicate.value
        : score.value !== predicate.value;
    case "NUMERIC":
      if (typeof score.value !== "number") return false;
      switch (predicate.operator) {
        case "=":
          return score.value === predicate.value;
        case "!=":
          return score.value !== predicate.value;
        case ">":
          return score.value > predicate.value;
        case ">=":
          return score.value >= predicate.value;
        case "<":
          return score.value < predicate.value;
        case "<=":
          return score.value <= predicate.value;
      }
  }
}
