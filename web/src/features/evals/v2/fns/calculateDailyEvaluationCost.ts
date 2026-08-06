export function calculateDailyEvaluationCost({
  matchingObservations,
  sampling,
  costPerEvaluation,
}: {
  matchingObservations: number;
  sampling: number;
  costPerEvaluation: number;
}) {
  return matchingObservations * sampling * costPerEvaluation;
}
