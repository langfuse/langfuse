import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { useScoreAnalytics } from "../ScoreAnalyticsProvider";
import { MetricCard } from "../charts/MetricCard";
import { SamplingDetailsHoverCard } from "../SamplingDetailsHoverCard";
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
  type InterpretationTranslator,
} from "@/src/features/score-analytics/lib/statistics-utils";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("evaluationAnalytics.scoreAnalytics");
  const translateInterpretation: InterpretationTranslator = (key, values) =>
    t(`interpretations.${key}` as Parameters<typeof t>[0], values);
  const { data, isLoading, params } = useScoreAnalytics();

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("statistics")}</CardTitle>
          <CardDescription>{t("loadingStatistics")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Spinner size="xl" variant="muted" />
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("statistics")}</CardTitle>
          <CardDescription>{t("noDataAvailable")}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground py-12 text-center text-sm">
          {t("selectScoreForStatistics")}
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
          {t("statistics")}
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
            ? t("scoreComparisonDescription", {
                score1Name: score1.name,
                score2Name: score2.name,
              })
            : t("scoreNeedsComparison", { scoreName: score1.name })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Section 1: Score 1 Data */}
        <div>
          <h4 className="mb-2 text-xs font-bold">
            {score1.name} ({score1.source})
          </h4>
          {dataType === "NUMERIC" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label={t("total")}
                value={
                  showScore1Data
                    ? statistics.score1.total.toLocaleString()
                    : "--"
                }
                helpText={t("totalScoreHelp", { scoreName: score1.name })}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label={t("mean")}
                value={
                  showScore1Data && statistics.score1.mean !== null
                    ? statistics.score1.mean.toFixed(2)
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText={t("averageScoreHelp", { scoreName: score1.name })}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label={t("standardDeviation")}
                value={
                  showScore1Data && statistics.score1.std !== null
                    ? statistics.score1.std.toFixed(2)
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText={t("standardDeviationHelp", {
                  scoreName: score1.name,
                })}
                isPlaceholder={!showScore1Data}
                isContext
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label={t("total")}
                value={
                  showScore1Data
                    ? statistics.score1.total.toLocaleString()
                    : "--"
                }
                helpText={t("totalScoreHelp", { scoreName: score1.name })}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label={t("mode")}
                value={
                  showScore1Data && statistics.score1.mode
                    ? `${statistics.score1.mode.category} (${statistics.score1.mode.count.toLocaleString()})`
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText={t("modeHelp")}
                isPlaceholder={!showScore1Data}
                isContext
              />
              <MetricCard
                label={t("modePercent")}
                value={
                  showScore1Data && statistics.score1.modePercentage !== null
                    ? `${statistics.score1.modePercentage.toFixed(1)}%`
                    : !showScore1Data
                      ? "--"
                      : "N/A"
                }
                helpText={t("modePercentHelp")}
                isPlaceholder={!showScore1Data}
                isContext
              />
            </div>
          )}
        </div>

        {/* Section 2: Score 2 Data - Always show to set expectations */}
        {showScore2Section && (
          <div>
            <h4 className="mb-2 text-xs font-bold">
              {score2?.name ?? t("score2Label")}
              {score2?.source ? ` (${score2.source})` : ""}
            </h4>
            {dataType === "NUMERIC" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label={t("total")}
                  value={
                    showScore2Data && statistics.score2
                      ? statistics.score2.total.toLocaleString()
                      : "--"
                  }
                  helpText={t("totalScoreHelp", {
                    scoreName: score2?.name ?? t("score2Label"),
                  })}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
                <MetricCard
                  label={t("mean")}
                  value={
                    showScore2Data &&
                    statistics.score2 &&
                    statistics.score2.mean !== null
                      ? statistics.score2.mean.toFixed(2)
                      : !showScore2Data
                        ? "--"
                        : "N/A"
                  }
                  helpText={t("averageScoreHelp", {
                    scoreName: score2?.name ?? t("score2Label"),
                  })}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
                <MetricCard
                  label={t("standardDeviation")}
                  value={
                    showScore2Data &&
                    statistics.score2 &&
                    statistics.score2.std !== null
                      ? statistics.score2.std.toFixed(2)
                      : !showScore2Data
                        ? "--"
                        : "N/A"
                  }
                  helpText={t("standardDeviationHelp", {
                    scoreName: score2?.name ?? t("score2Label"),
                  })}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label={t("total")}
                  value={
                    showScore2Data && statistics.score2
                      ? statistics.score2.total.toLocaleString()
                      : "--"
                  }
                  helpText={t("totalScoreHelp", {
                    scoreName: score2?.name ?? t("score2Label"),
                  })}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
                <MetricCard
                  label={t("mode")}
                  value={
                    showScore2Data && statistics.score2?.mode
                      ? `${statistics.score2.mode.category} (${statistics.score2.mode.count.toLocaleString()})`
                      : !showScore2Data
                        ? "--"
                        : "N/A"
                  }
                  helpText={t("modeHelp")}
                  isPlaceholder={!showScore2Data}
                  isContext
                />
                <MetricCard
                  label={t("modePercent")}
                  value={
                    showScore2Data &&
                    statistics.score2 &&
                    statistics.score2.modePercentage !== null
                      ? `${statistics.score2.modePercentage.toFixed(1)}%`
                      : !showScore2Data
                        ? "--"
                        : "N/A"
                  }
                  helpText={t("modePercentHelp")}
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
            <h4 className="mb-2 text-xs font-bold">{t("comparison")}</h4>
            {dataType === "NUMERIC" ? (
              <div className="space-y-4">
                {/* First row: Matched, Pearson, Spearman */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <MetricCard
                    label={t("matched")}
                    value={
                      showComparisonMetrics && statistics.comparison
                        ? statistics.comparison.matchedCount.toLocaleString()
                        : "--"
                    }
                    helpText={t("matchedHelp")}
                    warning={
                      hasCartesianProduct
                        ? {
                            show: true,
                            content: (
                              <div className="space-y-2 text-xs">
                                <p className="font-bold">
                                  {t("cartesianWarningTitle")}
                                </p>
                                <p>{t("cartesianWarningDescription")}</p>
                                <p className="text-muted-foreground">
                                  {t("cartesianWarningExample")}
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
                            translateInterpretation,
                          )
                        : undefined
                    }
                    helpText={t("linearCorrelationHelp")}
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
                            translateInterpretation,
                          )
                        : undefined
                    }
                    helpText={t("rankCorrelationHelp")}
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
                        ? interpretMAE(
                            statistics.comparison.mae,
                            undefined,
                            translateInterpretation,
                          )
                        : undefined
                    }
                    helpText={t("maeHelp")}
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
                        ? interpretRMSE(
                            statistics.comparison.rmse,
                            undefined,
                            translateInterpretation,
                          )
                        : undefined
                    }
                    helpText={t("rmseHelp")}
                    isPlaceholder={!showComparisonMetrics}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* First row: Matched, Agreement */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <MetricCard
                    label={t("matched")}
                    value={
                      showComparisonMetrics && statistics.comparison
                        ? statistics.comparison.matchedCount.toLocaleString()
                        : "--"
                    }
                    helpText={t("matchedHelp")}
                    warning={
                      hasCartesianProduct
                        ? {
                            show: true,
                            content: (
                              <div className="space-y-2 text-xs">
                                <p className="font-bold">
                                  {t("cartesianWarningTitle")}
                                </p>
                                <p>{t("cartesianWarningDescription")}</p>
                                <p className="text-muted-foreground">
                                  {t("cartesianWarningExample")}
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
                    label={t("agreement")}
                    value={
                      showComparisonMetrics && overallAgreement !== null
                        ? `${(overallAgreement * 100).toFixed(1)}%`
                        : showComparisonMetrics
                          ? "N/A"
                          : "--"
                    }
                    interpretation={
                      showComparisonMetrics && overallAgreement !== null
                        ? interpretOverallAgreement(
                            overallAgreement,
                            translateInterpretation,
                          )
                        : undefined
                    }
                    helpText={t("agreementHelp")}
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
                        ? interpretCohensKappa(
                            cohensKappa,
                            translateInterpretation,
                          )
                        : undefined
                    }
                    helpText={t("cohensKappaHelp")}
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
                        ? interpretF1Score(f1Score, translateInterpretation)
                        : undefined
                    }
                    helpText={t("f1ScoreHelp")}
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
