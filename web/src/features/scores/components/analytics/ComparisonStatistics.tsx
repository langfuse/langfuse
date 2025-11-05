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
  score1Source: string;
  score2Name: string | null;
  score2Source: string | null;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  counts: {
    score1Total: number;
    score2Total: number;
    matchedCount: number;
  };
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
  score1Mode?: { category: string; count: number } | null;
  score1ModePercentage?: number | null;
  score2Mode?: { category: string; count: number } | null;
  score2ModePercentage?: number | null;
}

/**
 * ComparisonStatistics component displays statistical metrics for score comparisons
 * Shows Score 1 data even with single score, Score 2 and comparison metrics with two scores
 * Organized in clear sections with consistent 3-column layout
 */
export function ComparisonStatistics({
  score1Name,
  score1Source,
  score2Name,
  score2Source,
  dataType,
  counts,
  statistics,
  confusionMatrix,
  hasTwoScores,
  score1Mode,
  score1ModePercentage,
  score2Mode,
  score2ModePercentage,
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

  // Determine what data to show
  // Score 1 data is always available and should be shown
  const showScore1Data = counts.score1Total > 0;
  // Score 2 data only shows when two scores are selected
  const showScore2Data = hasTwoScores && counts.score2Total > 0;
  // Comparison metrics only make sense with two scores
  const showComparisonMetrics = hasTwoScores;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistics</CardTitle>
        <CardDescription>
          {hasTwoScores
            ? `${score1Name} vs ${score2Name}`
            : `${score1Name} - Select a second score for comparison`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Section 1: Score 1 Data */}
        <div>
          <h4 className="mb-2 text-xs font-semibold">
            {score1Name} ({score1Source})
          </h4>
          {dataType === "NUMERIC" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="Total"
                value={
                  showScore1Data ? counts.score1Total.toLocaleString() : "--"
                }
                helpText={`Total number of ${score1Name} scores`}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label="Mean"
                value={
                  showScore1Data &&
                  statistics?.mean1 !== null &&
                  statistics?.mean1 !== undefined
                    ? statistics.mean1.toFixed(2)
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText={`Average value for ${score1Name}`}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label="Std Dev"
                value={
                  showScore1Data &&
                  statistics?.std1 !== null &&
                  statistics?.std1 !== undefined
                    ? statistics.std1.toFixed(2)
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText={`Standard deviation for ${score1Name}`}
                isPlaceholder={!showScore1Data}
                isContext
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="Total"
                value={
                  showScore1Data ? counts.score1Total.toLocaleString() : "--"
                }
                helpText={`Total number of ${score1Name} scores`}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label="Mode"
                value={
                  showScore1Data && score1Mode
                    ? `${score1Mode.category} (${score1Mode.count.toLocaleString()})`
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText="Most frequent category and its count"
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label="Mode %"
                value={
                  showScore1Data &&
                  score1ModePercentage !== null &&
                  score1ModePercentage !== undefined
                    ? `${score1ModePercentage.toFixed(1)}%`
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText="Percentage of observations with the most frequent category"
                isPlaceholder={!showScore1Data}
                isContext
              />
            </div>
          )}
        </div>

        {/* Section 2: Score 2 Data */}
        <div>
          <h4 className="mb-2 text-xs font-semibold">
            {score2Name ?? "Score 2"}
            {score2Source ? ` (${score2Source})` : ""}
          </h4>
          {dataType === "NUMERIC" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="Total"
                value={
                  showScore2Data ? counts.score2Total.toLocaleString() : "--"
                }
                helpText={`Total number of ${score2Name ?? "Score 2"} scores`}
                isPlaceholder={!showScore2Data}
                isContext
              />
              <MetricCard
                label="Mean"
                value={
                  showScore2Data &&
                  statistics?.mean2 !== null &&
                  statistics?.mean2 !== undefined
                    ? statistics.mean2.toFixed(2)
                    : !showScore2Data
                      ? "--"
                      : "N/A"
                }
                helpText={`Average value for ${score2Name ?? "Score 2"}`}
                isPlaceholder={!showScore2Data}
                isContext
              />
              <MetricCard
                label="Std Dev"
                value={
                  showScore2Data &&
                  statistics?.std2 !== null &&
                  statistics?.std2 !== undefined
                    ? statistics.std2.toFixed(2)
                    : !showScore2Data
                      ? "--"
                      : "N/A"
                }
                helpText={`Standard deviation for ${score2Name ?? "Score 2"}`}
                isPlaceholder={!showScore2Data}
                isContext
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="Total"
                value={
                  showScore2Data ? counts.score2Total.toLocaleString() : "--"
                }
                helpText={`Total number of ${score2Name ?? "Score 2"} scores`}
                isPlaceholder={!showScore2Data}
                isContext
              />
              <MetricCard
                label="Mode"
                value={
                  showScore2Data && score2Mode
                    ? `${score2Mode.category} (${score2Mode.count.toLocaleString()})`
                    : !showScore2Data
                      ? "--"
                      : "N/A"
                }
                helpText="Most frequent category and its count"
                isPlaceholder={!showScore2Data}
                isContext
              />
              <MetricCard
                label="Mode %"
                value={
                  showScore2Data &&
                  score2ModePercentage !== null &&
                  score2ModePercentage !== undefined
                    ? `${score2ModePercentage.toFixed(1)}%`
                    : !showScore2Data
                      ? "--"
                      : "N/A"
                }
                helpText="Percentage of observations with the most frequent category"
                isPlaceholder={!showScore2Data}
                isContext
              />
            </div>
          )}
        </div>

        {/* Section 3: Comparison Metrics */}
        <div>
          <h4 className="mb-2 text-xs font-semibold">Comparison</h4>
          {dataType === "NUMERIC" ? (
            // Numeric score comparison metrics
            <div className="space-y-3">
              {/* Row 1: Matched Pairs, Pearson, Spearman */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Matched Pairs"
                  value={
                    showComparisonMetrics
                      ? counts.matchedCount.toLocaleString()
                      : "--"
                  }
                  helpText="Number of observations with both scores present"
                  isPlaceholder={!showComparisonMetrics}
                />
                <MetricCard
                  label="Pearson"
                  value={
                    statistics?.pearsonCorrelation?.toFixed(3) ??
                    (showComparisonMetrics ? "N/A" : "--")
                  }
                  interpretation={
                    statistics?.pearsonCorrelation !== null &&
                    statistics?.pearsonCorrelation !== undefined
                      ? interpretPearsonCorrelation(
                          statistics.pearsonCorrelation,
                        )
                      : undefined
                  }
                  helpText="Linear relationship strength. Range: -1 to +1"
                  isPlaceholder={!showComparisonMetrics}
                />
                <MetricCard
                  label="Spearman"
                  value={
                    statistics?.spearmanCorrelation?.toFixed(3) ??
                    (showComparisonMetrics ? "N/A" : "--")
                  }
                  interpretation={
                    statistics?.spearmanCorrelation !== null &&
                    statistics?.spearmanCorrelation !== undefined
                      ? interpretSpearmanCorrelation(
                          statistics.spearmanCorrelation,
                        )
                      : undefined
                  }
                  helpText="Rank-based relationship strength. Less sensitive to outliers"
                  isPlaceholder={!showComparisonMetrics}
                />
              </div>

              {/* Row 2: Mean Absolute Error, RMSE */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Mean Absolute Error"
                  value={
                    statistics?.mae?.toFixed(3) ??
                    (showComparisonMetrics ? "N/A" : "--")
                  }
                  interpretation={
                    statistics?.mae !== null && statistics?.mae !== undefined
                      ? interpretMAE(statistics.mae)
                      : undefined
                  }
                  helpText="Average absolute difference between score pairs. Lower is better"
                  isPlaceholder={!showComparisonMetrics}
                />
                <MetricCard
                  label="RMSE"
                  value={
                    statistics?.rmse?.toFixed(3) ??
                    (showComparisonMetrics ? "N/A" : "--")
                  }
                  interpretation={
                    statistics?.rmse !== null && statistics?.rmse !== undefined
                      ? interpretRMSE(statistics.rmse)
                      : undefined
                  }
                  helpText="Root mean squared error. Penalizes large errors more than MAE"
                  isPlaceholder={!showComparisonMetrics}
                />
              </div>
            </div>
          ) : (
            // Categorical/Boolean score comparison metrics
            <div className="space-y-3">
              {/* Row 1: Matched Pairs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Matched Pairs"
                  value={
                    showComparisonMetrics
                      ? counts.matchedCount.toLocaleString()
                      : "--"
                  }
                  helpText="Number of observations with both scores present"
                  isPlaceholder={!showComparisonMetrics}
                />
              </div>

              {/* Row 2: Overall Agreement, Cohen's Kappa, F1 Score */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Overall Agreement"
                  value={
                    overallAgreement !== null
                      ? `${(overallAgreement * 100).toFixed(1)}%`
                      : showComparisonMetrics
                        ? "N/A"
                        : "--"
                  }
                  interpretation={
                    overallAgreement !== null
                      ? interpretOverallAgreement(overallAgreement)
                      : undefined
                  }
                  helpText="Percentage of cases where both scores agree"
                  isPlaceholder={!showComparisonMetrics}
                />
                <MetricCard
                  label="Cohen's Kappa"
                  value={
                    cohensKappa?.toFixed(3) ??
                    (showComparisonMetrics ? "N/A" : "--")
                  }
                  interpretation={
                    cohensKappa !== null
                      ? interpretCohensKappa(cohensKappa)
                      : undefined
                  }
                  helpText="Inter-rater agreement accounting for chance. Range: -1 to +1 where >0.8 is almost perfect"
                  isPlaceholder={!showComparisonMetrics}
                />
                <MetricCard
                  label="F1 Score"
                  value={
                    f1Score?.toFixed(3) ??
                    (showComparisonMetrics ? "N/A" : "--")
                  }
                  interpretation={
                    f1Score !== null ? interpretF1Score(f1Score) : undefined
                  }
                  helpText="Harmonic mean of precision and recall, weighted by class support. Range: 0 to 1"
                  isPlaceholder={!showComparisonMetrics}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
