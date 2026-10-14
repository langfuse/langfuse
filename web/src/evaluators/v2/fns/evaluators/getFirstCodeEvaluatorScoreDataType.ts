export type AlertScoreDataType = "NUMERIC" | "BOOLEAN" | "CATEGORICAL";

const ALERT_SCORE_DATA_TYPES = new Set<AlertScoreDataType>([
  "NUMERIC",
  "BOOLEAN",
  "CATEGORICAL",
]);

/** Reads the first score data type declared in stored code evaluator source. */
export function getFirstCodeEvaluatorScoreDataType(
  sourceCode: string,
): AlertScoreDataType | undefined {
  const match = sourceCode.match(
    /(?:["']dataType["']|dataType)\s*:\s*(?:["'](NUMERIC|BOOLEAN|CATEGORICAL|TEXT)["']|ScoreDataTypeEnum\.(NUMERIC|BOOLEAN|CATEGORICAL|TEXT))/,
  );
  const dataType = match?.[1] ?? match?.[2];

  return dataType && ALERT_SCORE_DATA_TYPES.has(dataType as AlertScoreDataType)
    ? (dataType as AlertScoreDataType)
    : undefined;
}
