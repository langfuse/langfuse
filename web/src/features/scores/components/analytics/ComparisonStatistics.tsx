import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { MetricCard } from "./MetricCard";
import {
  calculateCohensKappa,
  calculateWeightedF1Score,
  calculateOverallAgreement,
  interpretPearsonCorrelation,
  interpretSpearmanCorrelation,
  interpretCohensKappa,
  interpretF1Score,
  interpretOverallAgreement,
  interpretMAE,
  interpretRMSE,
  type ConfusionMatrixRow,
} from "@/src/features/scores/lib/statistics-utils";

interface ComparisonStatisticsProps {
  score1Name: string;
  score2Name: string | null;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  statistics: {
    matchedCount: number;
    mean1: number | null;
    mean2: number | null;
    std1: number | null;
    std2: number | null;
    pearsonCorrelation: number | null;
    spearmanCorrelation: number | null;
    mae: number | null;
    rmse: number | null;
  } | null;
  confusionMatrix?: ConfusionMatrixRow[];
  hasTwoScores: boolean;
}

/**
 * ComparisonStatistics component displays statistical metrics for score comparisons
 * Supports both numeric (correlation, error) and categorical (agreement, F1) metrics
 * Includes placeholder state when only one score is selected (LF-1950 compatibility)
 */
export function ComparisonStatistics({
  score1Name,
  score2Name,
  dataType,
  statistics,
  confusionMatrix,
  hasTwoScores,
}: ComparisonStatisticsProps) {
  // Calculate categorical metrics if confusion matrix is available
  const cohensKappa = confusionMatrix
    ? calculateCohensKappa(confusionMatrix)
    : null;
  const f1Score = confusionMatrix
    ? calculateWeightedF1Score(confusionMatrix)
    : null;
  const overallAgreement = confusionMatrix
    ? calculateOverallAgreement(confusionMatrix)
    : null;

  // Determine if we should show placeholder state
  const isPlaceholder = !hasTwoScores;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparison Statistics</CardTitle>
        <CardDescription>
          {hasTwoScores
            ? dataType === "NUMERIC"
              ? `Correlation and error metrics for ${score1Name} vs ${score2Name}`
              : `Agreement metrics for ${score1Name} vs ${score2Name}`
            : "Select a second score to view comparison statistics"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {dataType === "NUMERIC" ? (
          // Numeric score metrics
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Pearson Correlation"
              value={
                statistics?.pearsonCorrelation?.toFixed(3) ??
                (isPlaceholder ? "--" : "N/A")
              }
              interpretation={
                statistics?.pearsonCorrelation !== null &&
                statistics?.pearsonCorrelation !== undefined
                  ? interpretPearsonCorrelation(statistics.pearsonCorrelation)
                  : undefined
              }
              helpText="Measures linear relationship strength between scores. Range: -1 (perfect negative) to +1 (perfect positive)"
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label="Spearman Correlation"
              value={
                statistics?.spearmanCorrelation?.toFixed(3) ??
                (isPlaceholder ? "--" : "N/A")
              }
              interpretation={
                statistics?.spearmanCorrelation !== null &&
                statistics?.spearmanCorrelation !== undefined
                  ? interpretSpearmanCorrelation(statistics.spearmanCorrelation)
                  : undefined
              }
              helpText="Measures monotonic relationship strength (rank-based). Less sensitive to outliers than Pearson"
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label="Mean Absolute Error"
              value={
                statistics?.mae?.toFixed(3) ?? (isPlaceholder ? "--" : "N/A")
              }
              interpretation={
                statistics?.mae !== null && statistics?.mae !== undefined
                  ? interpretMAE(statistics.mae)
                  : undefined
              }
              helpText="Average absolute difference between score pairs. Lower is better"
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label="RMSE"
              value={
                statistics?.rmse?.toFixed(3) ?? (isPlaceholder ? "--" : "N/A")
              }
              interpretation={
                statistics?.rmse !== null && statistics?.rmse !== undefined
                  ? interpretRMSE(statistics.rmse)
                  : undefined
              }
              helpText="Root mean squared error. Penalizes large errors more than MAE"
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label={`${score1Name} Mean ± Std`}
              value={
                statistics?.mean1 !== null && statistics?.mean1 !== undefined
                  ? `${statistics.mean1.toFixed(2)} ± ${(statistics.std1 ?? 0).toFixed(2)}`
                  : isPlaceholder
                    ? "--"
                    : "N/A"
              }
              helpText={`Average and standard deviation for ${score1Name}`}
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label={`${score2Name ?? "Score 2"} Mean ± Std`}
              value={
                statistics?.mean2 !== null && statistics?.mean2 !== undefined
                  ? `${statistics.mean2.toFixed(2)} ± ${(statistics.std2 ?? 0).toFixed(2)}`
                  : isPlaceholder
                    ? "--"
                    : "N/A"
              }
              helpText={`Average and standard deviation for ${score2Name ?? "Score 2"}`}
              isPlaceholder={isPlaceholder}
            />
          </div>
        ) : (
          // Categorical/Boolean score metrics
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Cohen's Kappa"
              value={cohensKappa?.toFixed(3) ?? (isPlaceholder ? "--" : "N/A")}
              interpretation={
                cohensKappa !== null
                  ? interpretCohensKappa(cohensKappa)
                  : undefined
              }
              helpText="Inter-rater agreement accounting for chance. Range: -1 to +1 where >0.8 is almost perfect"
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label="Weighted F1 Score"
              value={f1Score?.toFixed(3) ?? (isPlaceholder ? "--" : "N/A")}
              interpretation={
                f1Score !== null ? interpretF1Score(f1Score) : undefined
              }
              helpText="Harmonic mean of precision and recall, weighted by class support. Range: 0 to 1"
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label="Overall Agreement"
              value={
                overallAgreement !== null
                  ? `${(overallAgreement * 100).toFixed(1)}%`
                  : isPlaceholder
                    ? "--"
                    : "N/A"
              }
              interpretation={
                overallAgreement !== null
                  ? interpretOverallAgreement(overallAgreement)
                  : undefined
              }
              helpText="Percentage of cases where both scores agree"
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label={`${score1Name} Total`}
              value={
                statistics?.matchedCount !== undefined && !isPlaceholder
                  ? statistics.matchedCount.toLocaleString()
                  : "--"
              }
              helpText={`Total number of ${score1Name} scores`}
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label={`${score2Name ?? "Score 2"} Total`}
              value={
                statistics?.matchedCount !== undefined && !isPlaceholder
                  ? statistics.matchedCount.toLocaleString()
                  : "--"
              }
              helpText={`Total number of ${score2Name ?? "Score 2"} scores`}
              isPlaceholder={isPlaceholder}
            />
            <MetricCard
              label="Matched Pairs"
              value={
                statistics?.matchedCount !== undefined && !isPlaceholder
                  ? statistics.matchedCount.toLocaleString()
                  : "--"
              }
              helpText="Number of observations with both scores present"
              isPlaceholder={isPlaceholder}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
