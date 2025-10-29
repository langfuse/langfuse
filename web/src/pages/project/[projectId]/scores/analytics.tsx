import { useRouter } from "next/router";
import { useMemo, useEffect } from "react";
import Page from "@/src/components/layouts/page";
import {
  getScoresTabs,
  SCORES_TABS,
} from "@/src/features/navigation/utils/scores-tabs";
import { useAnalyticsUrlState } from "@/src/features/scores/lib/analytics-url-state";
import { ScoreSelector } from "@/src/features/scores/components/analytics/ScoreSelector";
import { ObjectTypeFilter } from "@/src/features/scores/components/analytics/ObjectTypeFilter";
import { type ScoreOption } from "@/src/features/scores/components/analytics/ScoreSelector";
import { TimeRangePicker } from "@/src/components/date-picker";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { DASHBOARD_AGGREGATION_OPTIONS } from "@/src/utils/date-range-utils";
import { BarChart3, Loader2 } from "lucide-react";
import { api } from "@/src/utils/api";
import {
  Heatmap,
  HeatmapLegend,
} from "@/src/features/scores/components/analytics";
import {
  generateNumericHeatmapData,
  generateConfusionMatrixData,
} from "@/src/features/scores/lib/heatmap-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";

// Type for the analytics data returned from the API
type AnalyticsData = {
  heatmap: Array<{
    binX: number;
    binY: number;
    count: number;
    min1: number;
    max1: number;
    min2: number;
    max2: number;
  }>;
  confusionMatrix: Array<{
    rowCategory: string;
    colCategory: string;
    count: number;
  }>;
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
    mae: number | null;
    rmse: number | null;
  } | null;
};

function TwoScoreVisualization({
  analyticsData,
  score1,
  score2,
}: {
  analyticsData: AnalyticsData;
  score1: ScoreOption;
  score2: ScoreOption;
}) {
  const isNumeric = score1.dataType === "NUMERIC";

  // Transform API data to match heatmap utils format
  const heatmapData = useMemo(() => {
    if (isNumeric && analyticsData.heatmap.length > 0) {
      return generateNumericHeatmapData({
        data: analyticsData.heatmap.map((h) => ({
          bin_x: h.binX,
          bin_y: h.binY,
          count: h.count,
          min1: h.min1,
          max1: h.max1,
          min2: h.min2,
          max2: h.max2,
        })),
        nBins: 10,
        colorVariant: "chart1",
        showCounts: true,
        showPercentages: false,
      });
    }
    return null;
  }, [analyticsData.heatmap, isNumeric]);

  const confusionData = useMemo(() => {
    if (!isNumeric && analyticsData.confusionMatrix.length > 0) {
      return generateConfusionMatrixData({
        data: analyticsData.confusionMatrix.map((c) => ({
          row_category: c.rowCategory,
          col_category: c.colCategory,
          count: c.count,
        })),
        colorVariant: "chart1",
        highlightDiagonal: true,
        showCounts: true,
        showPercentages: false,
      });
    }
    return null;
  }, [analyticsData.confusionMatrix, isNumeric]);

  const maxCount = useMemo(() => {
    if (isNumeric && analyticsData.heatmap.length > 0) {
      return Math.max(...analyticsData.heatmap.map((h) => h.count));
    }
    if (!isNumeric && analyticsData.confusionMatrix.length > 0) {
      return Math.max(...analyticsData.confusionMatrix.map((c) => c.count));
    }
    return 0;
  }, [analyticsData, isNumeric]);

  return (
    <div className="space-y-6 p-4">
      {/* Summary Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle>Comparison Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {score1.name} total
              </p>
              <p className="text-2xl font-bold">
                {analyticsData.counts.score1Total.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {score2.name} total
              </p>
              <p className="text-2xl font-bold">
                {analyticsData.counts.score2Total.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Matched pairs</p>
              <p className="text-2xl font-bold">
                {analyticsData.counts.matchedCount.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap/Confusion Matrix Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isNumeric ? "Score Correlation Heatmap" : "Confusion Matrix"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isNumeric && heatmapData ? (
            <div className="space-y-4">
              <Heatmap
                data={heatmapData.cells}
                rows={10}
                cols={10}
                rowLabels={heatmapData.rowLabels}
                colLabels={heatmapData.colLabels}
                xAxisLabel={`${score2.name} (${score2.source})`}
                yAxisLabel={`${score1.name} (${score1.source})`}
                renderTooltip={(cell) => (
                  <div className="space-y-1">
                    <p className="font-semibold">Count: {cell.value}</p>
                    <p className="text-xs">
                      {score1.name}:{" "}
                      {(cell.metadata?.yRange as [number, number])?.[0].toFixed(
                        2,
                      )}{" "}
                      -{" "}
                      {(cell.metadata?.yRange as [number, number])?.[1].toFixed(
                        2,
                      )}
                    </p>
                    <p className="text-xs">
                      {score2.name}:{" "}
                      {(cell.metadata?.xRange as [number, number])?.[0].toFixed(
                        2,
                      )}{" "}
                      -{" "}
                      {(cell.metadata?.xRange as [number, number])?.[1].toFixed(
                        2,
                      )}
                    </p>
                    <p className="text-xs">
                      {(cell.metadata?.percentage as number)?.toFixed(1)}% of
                      total
                    </p>
                  </div>
                )}
              />
              <HeatmapLegend
                min={0}
                max={maxCount}
                variant="chart1"
                title="Count"
              />
            </div>
          ) : !isNumeric && confusionData ? (
            <div className="space-y-4">
              <Heatmap
                data={confusionData.cells}
                rows={confusionData.rows}
                cols={confusionData.cols}
                rowLabels={confusionData.rowLabels}
                colLabels={confusionData.colLabels}
                xAxisLabel={`${score2.name} (${score2.source})`}
                yAxisLabel={`${score1.name} (${score1.source})`}
                renderTooltip={(cell) => (
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {cell.metadata?.rowCategory as string} →{" "}
                      {cell.metadata?.colCategory as string}
                    </p>
                    <p>Count: {cell.value}</p>
                    <p className="text-xs">
                      {(cell.metadata?.percentage as number)?.toFixed(1)}% of
                      total
                    </p>
                    {cell.metadata?.isDiagonal && (
                      <p className="text-xs">✓ Agreement</p>
                    )}
                  </div>
                )}
              />
              <HeatmapLegend
                min={0}
                max={maxCount}
                variant="chart1"
                title="Count"
              />
            </div>
          ) : (
            <p className="text-center text-muted-foreground">
              No comparison data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Statistics Card (for numeric scores) */}
      {isNumeric && analyticsData.statistics && (
        <Card>
          <CardHeader>
            <CardTitle>Statistical Measures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {analyticsData.statistics.pearsonCorrelation !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Pearson Correlation
                  </p>
                  <p className="text-2xl font-bold">
                    {analyticsData.statistics.pearsonCorrelation.toFixed(3)}
                  </p>
                </div>
              )}
              {analyticsData.statistics.mae !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">MAE</p>
                  <p className="text-2xl font-bold">
                    {analyticsData.statistics.mae.toFixed(3)}
                  </p>
                </div>
              )}
              {analyticsData.statistics.rmse !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">RMSE</p>
                  <p className="text-2xl font-bold">
                    {analyticsData.statistics.rmse.toFixed(3)}
                  </p>
                </div>
              )}
              {analyticsData.statistics.mean1 !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Mean {score1.name}
                  </p>
                  <p className="text-2xl font-bold">
                    {analyticsData.statistics.mean1.toFixed(3)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ScoresAnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const {
    state: urlState,
    setScore1,
    setScore2,
    setObjectType,
  } = useAnalyticsUrlState();

  const { timeRange, setTimeRange } = useDashboardDateRange();

  // Fetch available scores from API
  const {
    data: scoresData,
    isLoading: scoresLoading,
    error: scoresError,
  } = api.scores.getScoreIdentifiers.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // TODO: REMOVE BEFORE MERGING TO MAIN - Log the query result to console for debugging
  useEffect(() => {
    if (scoresData) {
      console.log("[Score Analytics] Fetched score identifiers:", scoresData);
    }
  }, [scoresData]);

  // Transform API data to ScoreOption format and sort by dataType
  const scoreOptions: ScoreOption[] = useMemo(() => {
    if (!scoresData?.scores) return [];

    // Define sort order for data types
    const typeOrder: Record<string, number> = {
      BOOLEAN: 0,
      CATEGORICAL: 1,
      NUMERIC: 2,
    };

    return scoresData.scores
      .map((score) => ({
        value: score.value,
        name: score.name,
        dataType: score.dataType,
        source: score.source,
      }))
      .sort((a, b) => {
        // Sort by dataType first
        const typeA = typeOrder[a.dataType] ?? 999;
        const typeB = typeOrder[b.dataType] ?? 999;
        if (typeA !== typeB) return typeA - typeB;

        // Then by name alphabetically
        return a.name.localeCompare(b.name);
      });
  }, [scoresData]);

  // Parse selected scores to get their data types
  const score1DataType = useMemo(() => {
    if (!urlState.score1) return undefined;
    const selected = scoreOptions.find((opt) => opt.value === urlState.score1);
    return selected?.dataType;
  }, [urlState.score1, scoreOptions]);

  // Parse selected scores to get their full details
  const score1Details = useMemo(() => {
    if (!urlState.score1) return undefined;
    return scoreOptions.find((opt) => opt.value === urlState.score1);
  }, [urlState.score1, scoreOptions]);

  const score2Details = useMemo(() => {
    if (!urlState.score2) return undefined;
    return scoreOptions.find((opt) => opt.value === urlState.score2);
  }, [urlState.score2, scoreOptions]);

  // Fetch comparison analytics when two scores are selected
  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = api.scores.getScoreComparisonAnalytics.useQuery(
    {
      projectId,
      score1: {
        name: score1Details?.name ?? "",
        dataType: score1Details?.dataType ?? "",
        source: score1Details?.source ?? "",
      },
      score2: {
        name: score2Details?.name ?? "",
        dataType: score2Details?.dataType ?? "",
        source: score2Details?.source ?? "",
      },
      fromTimestamp: timeRange.start,
      toTimestamp: timeRange.end,
      interval: "day",
      nBins: 10,
    },
    {
      enabled: !!projectId && !!score1Details && !!score2Details,
    },
  );

  const hasError = !!scoresError;
  const hasNoScores = !scoresLoading && !hasError && scoreOptions.length === 0;
  const hasNoSelection = !urlState.score1;

  return (
    <Page
      headerProps={{
        title: "Scores",
        breadcrumb: [{ name: "Scores", href: `/project/${projectId}/scores` }],
        help: {
          description:
            "A score is an evaluation of a trace or observation. It can be created from user feedback, model-based evaluations, or manual review. See docs to learn more.",
          href: "https://langfuse.com/docs/evaluation/overview",
        },
        tabsProps: {
          tabs: getScoresTabs(projectId),
          activeTab: SCORES_TABS.ANALYTICS,
        },
      }}
    >
      <div className="flex flex-col gap-2">
        {/* Controls Section - Compact Toolbar */}
        <div className="flex flex-col gap-1 border-b border-border p-2 lg:flex-row lg:items-center lg:gap-4">
          {/* Left: Score Selectors */}
          <div className="flex items-center gap-2">
            <ScoreSelector
              value={urlState.score1}
              onChange={setScore1}
              options={scoreOptions}
              placeholder="First score"
              className="h-8 w-[160px]"
            />
            <ScoreSelector
              value={urlState.score2}
              onChange={setScore2}
              options={scoreOptions}
              placeholder="Second score"
              filterByDataType={score1DataType}
              className="h-8 w-[160px]"
            />
          </div>

          {/* Middle: Spacer (hidden on mobile) */}
          <div className="hidden flex-1 lg:block" />

          {/* Right: Filters */}
          <div className="flex items-center gap-2">
            <ObjectTypeFilter
              value={urlState.objectType}
              onChange={setObjectType}
              className="h-8 w-[140px]"
            />
            <TimeRangePicker
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              timeRangePresets={DASHBOARD_AGGREGATION_OPTIONS}
              className="my-0"
            />
          </div>
        </div>

        {/* Content Section */}
        {hasError ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-destructive/10 p-12">
            <BarChart3 className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Error Loading Scores</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Failed to load score data. Please try refreshing the page.
              </p>
            </div>
          </div>
        ) : hasNoScores ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-muted/20 p-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">No Scores Available</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create scores by adding evaluations to your traces and
                observations.
              </p>
            </div>
          </div>
        ) : hasNoSelection ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-muted/20 p-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Select a Score</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose at least one score from the dropdowns above to view
                analytics.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                <strong>Single score:</strong> View distribution and trends over
                time
                <br />
                <strong>Two scores:</strong> Compare scores with heatmaps and
                statistical analysis
              </p>
            </div>
          </div>
        ) : urlState.score2 ? (
          // Two scores selected - show comparison analytics
          analyticsLoading ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading comparison analytics...
              </p>
            </div>
          ) : analyticsError ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-destructive/10 p-12">
              <BarChart3 className="h-12 w-12 text-destructive" />
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  Error Loading Analytics
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Failed to load comparison data. Please try refreshing the
                  page.
                </p>
              </div>
            </div>
          ) : analyticsData ? (
            <TwoScoreVisualization
              analyticsData={analyticsData}
              score1={score1Details!}
              score2={score2Details!}
            />
          ) : null
        ) : (
          // Single score selected - placeholder for future implementation
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border p-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Single Score Analytics</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Single score distribution and time series visualization coming
                soon.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Select a second score to view comparison analytics.
              </p>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
