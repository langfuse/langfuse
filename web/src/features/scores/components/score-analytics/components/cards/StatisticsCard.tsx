import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Loader2 } from "lucide-react";
import { useScoreAnalytics } from "../ScoreAnalyticsProvider";
import { MetricCard } from "../charts/MetricCard";
import { SamplingDetailsHoverCard } from "../ScoreAnalyticsNoticeBanner";
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
} from "@/src/features/scores/components/score-analytics/libs/statistics-utils";

/**
 * StatisticsCard - Smart card component for displaying score statistics
 *
 * Consumes ScoreAnalyticsProvider context and displays:
 * - Score 1 stats (always shown)
 * - Score 2 stats (shown in two-score mode)
 * - Comparison metrics (shown in two-score mode)
 *
 * Handles:
 * - Loading states
 * - Empty states
 * - Single vs two-score modes
 * - Numeric vs categorical data types
 */
export function StatisticsCard() {
  const { data, isLoading, params } = useScoreAnalytics();

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
          <CardDescription>Loading statistics...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Select a score to view statistics
        </CardContent>
      </Card>
    );
  }

  // Extract data from context
  const { statistics, metadata } = data;
  const { dataType } = metadata;
  const { score1, score2 } = params;

  // Check if Cartesian product occurred (matched count exceeds both individual counts)
  const hasCartesianProduct =
    statistics.comparison &&
    statistics.comparison.matchedCount > statistics.score1.total &&
    statistics.score2 &&
    statistics.comparison.matchedCount > statistics.score2.total;

  // Determine what to show
  const showScore1Data = statistics.score1.total > 0;
  const showScore2Data = statistics.score2 !== null;
  const showComparisonMetrics = statistics.comparison !== null;

  // Always show Score 2 and Comparison sections once score1 is selected
  // to set user expectations about what information will be available
  const showScore2Section = true; // Always show when on this page
  const showComparisonSection = true; // Always show when on this page

  // Calculate categorical metrics if available
  const cohensKappa =
    showComparisonMetrics && statistics.comparison?.confusionMatrix
      ? calculateCohensKappa(statistics.comparison.confusionMatrix)
      : null;
  const f1Score =
    showComparisonMetrics && statistics.comparison?.confusionMatrix
      ? calculateWeightedF1Score(statistics.comparison.confusionMatrix)
      : null;
  const overallAgreement =
    showComparisonMetrics && statistics.comparison?.confusionMatrix
      ? calculateOverallAgreement(statistics.comparison.confusionMatrix)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Statistics
          {data.samplingMetadata.isSampled && (
            <SamplingDetailsHoverCard
              samplingMetadata={data.samplingMetadata}
              mode={data.metadata.mode}
              showLabel
            />
          )}
        </CardTitle>
        <CardDescription>
          {score2
            ? `${score1.name} vs ${score2.name}`
            : `${score1.name} - Select a second score for comparison`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Section 1: Score 1 Data */}
        <div>
          <h4 className="mb-2 text-xs font-semibold">
            {score1.name} ({score1.source})
          </h4>
          {dataType === "NUMERIC" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="Total"
                value={
                  showScore1Data
                    ? statistics.score1.total.toLocaleString()
                    : "--"
                }
                helpText={`Total number of ${score1.name} scores`}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label="Mean"
                value={
                  showScore1Data && statistics.score1.mean !== null
                    ? statistics.score1.mean.toFixed(2)
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText={`Average value for ${score1.name}`}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label="Std Dev"
                value={
                  showScore1Data && statistics.score1.std !== null
                    ? statistics.score1.std.toFixed(2)
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText={`Standard deviation for ${score1.name}`}
                isPlaceholder={!showScore1Data}
                isContext
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="Total"
                value={
                  showScore1Data
                    ? statistics.score1.total.toLocaleString()
                    : "--"
                }
                helpText={`Total number of ${score1.name} scores`}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label="Mode"
                value={
                  showScore1Data && statistics.score1.mode
                    ? `${statistics.score1.mode.category} (${statistics.score1.mode.count.toLocaleString()})`
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
                  showScore1Data && statistics.score1.modePercentage !== null
                    ? `${statistics.score1.modePercentage.toFixed(1)}%`
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

        {/* Section 2: Score 2 Data - Always show to set expectations */}
        {showScore2Section && (
          <div>
            <h4 className="mb-2 text-xs font-semibold">
              {score2?.name ?? "Score 2"}
              {score2?.source ? ` (${score2.source})` : ""}
            </h4>
            {dataType === "NUMERIC" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Total"
                  value={
                    showScore2Data && statistics.score2
                      ? statistics.score2.total.toLocaleString()
                      : "--"
                  }
                  helpText={`Total number of ${score2?.name ?? "Score 2"} scores`}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
                <MetricCard
                  label="Mean"
                  value={
                    showScore2Data &&
                    statistics.score2 &&
                    statistics.score2.mean !== null
                      ? statistics.score2.mean.toFixed(2)
                      : !showScore2Data
                        ? "--"
                        : "N/A"
                  }
                  helpText={`Average value for ${score2?.name ?? "Score 2"}`}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
                <MetricCard
                  label="Std Dev"
                  value={
                    showScore2Data &&
                    statistics.score2 &&
                    statistics.score2.std !== null
                      ? statistics.score2.std.toFixed(2)
                      : !showScore2Data
                        ? "--"
                        : "N/A"
                  }
                  helpText={`Standard deviation for ${score2?.name ?? "Score 2"}`}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Total"
                  value={
                    showScore2Data && statistics.score2
                      ? statistics.score2.total.toLocaleString()
                      : "--"
                  }
                  helpText={`Total number of ${score2?.name ?? "Score 2"} scores`}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
                <MetricCard
                  label="Mode"
                  value={
                    showScore2Data && statistics.score2?.mode
                      ? `${statistics.score2.mode.category} (${statistics.score2.mode.count.toLocaleString()})`
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
                    statistics.score2 &&
                    statistics.score2.modePercentage !== null
                      ? `${statistics.score2.modePercentage.toFixed(1)}%`
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
        )}

        {/* Section 3: Comparison Metrics - Always show to set expectations */}
        {showComparisonSection && (
          <div>
            <h4 className="mb-2 text-xs font-semibold">Comparison</h4>
            {dataType === "NUMERIC" ? (
              <div className="space-y-4">
                {/* First row: Matched, Pearson, Spearman */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <MetricCard
                    label="Matched"
                    value={
                      showComparisonMetrics && statistics.comparison
                        ? statistics.comparison.matchedCount.toLocaleString()
                        : "--"
                    }
                    helpText="Number of observations with both scores"
                    warning={
                      hasCartesianProduct
                        ? {
                            show: true,
                            content: (
                              <div className="space-y-2 text-xs">
                                <p className="font-semibold">
                                  Matched count exceeds individual score counts
                                  due to Cartesian product
                                </p>
                                <p>
                                  This occurs when multiple scores of the same
                                  name/source exist on a single attachment point
                                  (trace/observation/session/run). Each
                                  combination creates a match.
                                </p>
                                <p className="text-muted-foreground">
                                  <strong>Example:</strong> If one trace has 2
                                  &quot;gpt4&quot; scores and 3
                                  &quot;gemini&quot; scores, this creates 6
                                  matched pairs (2 × 3 = 6).
                                </p>
                              </div>
                            ),
                          }
                        : undefined
                    }
                    isContext
                    isPlaceholder={!showComparisonMetrics}
                  />
                  <MetricCard
                    label="Pearson r"
                    value={
                      showComparisonMetrics &&
                      statistics.comparison &&
                      statistics.comparison.pearsonCorrelation !== null
                        ? statistics.comparison.pearsonCorrelation.toFixed(3)
                        : showComparisonMetrics
                          ? "N/A"
                          : "--"
                    }
                    interpretation={
                      showComparisonMetrics &&
                      statistics.comparison &&
                      statistics.comparison.pearsonCorrelation !== null
                        ? interpretPearsonCorrelation(
                            statistics.comparison.pearsonCorrelation,
                          )
                        : undefined
                    }
                    helpText="Linear correlation (-1 to 1)"
                    isPlaceholder={!showComparisonMetrics}
                  />
                  <MetricCard
                    label="Spearman ρ"
                    value={
                      showComparisonMetrics &&
                      statistics.comparison &&
                      statistics.comparison.spearmanCorrelation !== null
                        ? statistics.comparison.spearmanCorrelation.toFixed(3)
                        : showComparisonMetrics
                          ? "N/A"
                          : "--"
                    }
                    interpretation={
                      showComparisonMetrics &&
                      statistics.comparison &&
                      statistics.comparison.spearmanCorrelation !== null
                        ? interpretSpearmanCorrelation(
                            statistics.comparison.spearmanCorrelation,
                          )
                        : undefined
                    }
                    helpText="Rank correlation (-1 to 1)"
                    isPlaceholder={!showComparisonMetrics}
                  />
                </div>
                {/* Second row: Empty, MAE, RMSE */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div />
                  <MetricCard
                    label="MAE"
                    value={
                      showComparisonMetrics &&
                      statistics.comparison &&
                      statistics.comparison.mae !== null
                        ? statistics.comparison.mae.toFixed(3)
                        : showComparisonMetrics
                          ? "N/A"
                          : "--"
                    }
                    interpretation={
                      showComparisonMetrics &&
                      statistics.comparison &&
                      statistics.comparison.mae !== null
                        ? interpretMAE(statistics.comparison.mae)
                        : undefined
                    }
                    helpText="Mean Absolute Error"
                    isPlaceholder={!showComparisonMetrics}
                  />
                  <MetricCard
                    label="RMSE"
                    value={
                      showComparisonMetrics &&
                      statistics.comparison &&
                      statistics.comparison.rmse !== null
                        ? statistics.comparison.rmse.toFixed(3)
                        : showComparisonMetrics
                          ? "N/A"
                          : "--"
                    }
                    interpretation={
                      showComparisonMetrics &&
                      statistics.comparison &&
                      statistics.comparison.rmse !== null
                        ? interpretRMSE(statistics.comparison.rmse)
                        : undefined
                    }
                    helpText="Root Mean Square Error"
                    isPlaceholder={!showComparisonMetrics}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* First row: Matched, Agreement */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <MetricCard
                    label="Matched"
                    value={
                      showComparisonMetrics && statistics.comparison
                        ? statistics.comparison.matchedCount.toLocaleString()
                        : "--"
                    }
                    helpText="Number of observations with both scores"
                    warning={
                      hasCartesianProduct
                        ? {
                            show: true,
                            content: (
                              <div className="space-y-2 text-xs">
                                <p className="font-semibold">
                                  Matched count exceeds individual score counts
                                  due to Cartesian product
                                </p>
                                <p>
                                  This occurs when multiple scores of the same
                                  name/source exist on a single attachment point
                                  (trace/observation/session/run). Each
                                  combination creates a match.
                                </p>
                                <p className="text-muted-foreground">
                                  <strong>Example:</strong> If one trace has 2
                                  &quot;gpt4&quot; scores and 3
                                  &quot;gemini&quot; scores, this creates 6
                                  matched pairs (2 × 3 = 6).
                                </p>
                              </div>
                            ),
                          }
                        : undefined
                    }
                    isContext
                    isPlaceholder={!showComparisonMetrics}
                  />
                  <MetricCard
                    label="Agreement"
                    value={
                      showComparisonMetrics && overallAgreement !== null
                        ? `${(overallAgreement * 100).toFixed(1)}%`
                        : showComparisonMetrics
                          ? "N/A"
                          : "--"
                    }
                    interpretation={
                      showComparisonMetrics && overallAgreement !== null
                        ? interpretOverallAgreement(overallAgreement)
                        : undefined
                    }
                    helpText="Overall agreement percentage"
                    isPlaceholder={!showComparisonMetrics}
                  />
                </div>
                {/* Second row: Empty, Cohen's κ, F1 Score */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div />
                  <MetricCard
                    label="Cohen's κ"
                    value={
                      showComparisonMetrics && cohensKappa !== null
                        ? cohensKappa.toFixed(3)
                        : showComparisonMetrics
                          ? "N/A"
                          : "--"
                    }
                    interpretation={
                      showComparisonMetrics && cohensKappa !== null
                        ? interpretCohensKappa(cohensKappa)
                        : undefined
                    }
                    helpText="Inter-rater reliability (-1 to 1)"
                    isPlaceholder={!showComparisonMetrics}
                  />
                  <MetricCard
                    label="F1 Score"
                    value={
                      showComparisonMetrics && f1Score !== null
                        ? f1Score.toFixed(3)
                        : showComparisonMetrics
                          ? "N/A"
                          : "--"
                    }
                    interpretation={
                      showComparisonMetrics && f1Score !== null
                        ? interpretF1Score(f1Score)
                        : undefined
                    }
                    helpText="Weighted F1 score (0 to 1)"
                    isPlaceholder={!showComparisonMetrics}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
