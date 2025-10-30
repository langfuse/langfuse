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
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";

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

  // Parse score identifiers (format: "name-dataType-source")
  const parsedScore1 = useMemo(() => {
    if (!urlState.score1) return null;
    const selected = scoreOptions.find((opt) => opt.value === urlState.score1);
    if (!selected) return null;
    return {
      name: selected.name,
      dataType: selected.dataType,
      source: selected.source,
    };
  }, [urlState.score1, scoreOptions]);

  const parsedScore2 = useMemo(() => {
    if (!urlState.score2) return null;
    const selected = scoreOptions.find((opt) => opt.value === urlState.score2);
    if (!selected) return null;
    return {
      name: selected.name,
      dataType: selected.dataType,
      source: selected.source,
    };
  }, [urlState.score2, scoreOptions]);

  // Convert time range to absolute dates
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  // Fetch comparison analytics when two scores are selected
  const shouldFetchComparison = !!(
    parsedScore1 &&
    parsedScore2 &&
    projectId &&
    absoluteTimeRange?.from &&
    absoluteTimeRange?.to
  );

  // TODO: REMOVE BEFORE MERGING - Debug logging
  useEffect(() => {
    console.log("[Score Analytics] Fetch conditions:", {
      parsedScore1,
      parsedScore2,
      projectId,
      timeRange,
      absoluteTimeRange,
      shouldFetchComparison,
    });
  }, [
    parsedScore1,
    parsedScore2,
    projectId,
    timeRange,
    absoluteTimeRange,
    shouldFetchComparison,
  ]);

  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = api.scores.getScoreComparisonAnalytics.useQuery(
    {
      projectId,
      score1: parsedScore1!,
      score2: parsedScore2!,
      fromTimestamp: absoluteTimeRange?.from!,
      toTimestamp: absoluteTimeRange?.to!,
    },
    {
      enabled: shouldFetchComparison,
    },
  );

  // TODO: REMOVE BEFORE MERGING - Debug analytics query result
  useEffect(() => {
    if (shouldFetchComparison) {
      console.log("[Score Analytics] Query state:", {
        isLoading: analyticsLoading,
        hasData: !!analyticsData,
        hasError: !!analyticsError,
        error: analyticsError,
        data: analyticsData,
      });
    }
  }, [shouldFetchComparison, analyticsLoading, analyticsData, analyticsError]);

  // Preprocess heatmap data
  const heatmapData = useMemo(() => {
    if (!analyticsData || !parsedScore1) return null;

    const isNumeric = parsedScore1.dataType === "NUMERIC";

    if (isNumeric && analyticsData.heatmap.length > 0) {
      // Transform API data to match heatmap-utils expected format
      const transformedData = analyticsData.heatmap.map((row) => ({
        bin_x: row.binX,
        bin_y: row.binY,
        count: row.count,
        min1: row.min1,
        max1: row.max1,
        min2: row.min2,
        max2: row.max2,
      }));

      return generateNumericHeatmapData({
        data: transformedData,
        nBins: 10,
        colorVariant: "chart1",
        showCounts: true,
        showPercentages: false,
      });
    } else if (!isNumeric && analyticsData.confusionMatrix.length > 0) {
      // Transform API data for confusion matrix
      const transformedData = analyticsData.confusionMatrix.map((row) => ({
        row_category: row.rowCategory,
        col_category: row.colCategory,
        count: row.count,
      }));

      return generateConfusionMatrixData({
        data: transformedData,
        colorVariant: "chart1",
        highlightDiagonal: true,
        showCounts: true,
        showPercentages: true,
      });
    }

    return null;
  }, [analyticsData, parsedScore1]);

  const hasError = !!scoresError;
  const hasNoScores = !scoresLoading && !hasError && scoreOptions.length === 0;
  const hasNoSelection = !urlState.score1;
  const hasTwoScores = !!(urlState.score1 && urlState.score2);

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
        ) : !hasTwoScores ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-muted/20 p-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Single Score Analytics</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Single score analytics coming soon (LF-1919)
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                Select a second score to view comparison heatmaps
              </p>
            </div>
          </div>
        ) : analyticsLoading ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border p-12">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Loading analytics data...
            </p>
          </div>
        ) : analyticsError ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-destructive/10 p-12">
            <BarChart3 className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Error Loading Analytics</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Failed to load analytics data. Please try again.
              </p>
            </div>
          </div>
        ) : analyticsData && heatmapData ? (
          <div className="space-y-6 p-4">
            {/* Stats Summary */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Score 1 Total</CardDescription>
                  <CardTitle className="text-2xl">
                    {analyticsData.counts.score1Total.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Score 2 Total</CardDescription>
                  <CardTitle className="text-2xl">
                    {analyticsData.counts.score2Total.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Matched Pairs</CardDescription>
                  <CardTitle className="text-2xl">
                    {analyticsData.counts.matchedCount.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Heatmap / Confusion Matrix */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {parsedScore1.dataType === "NUMERIC"
                    ? "Score Comparison Heatmap"
                    : "Confusion Matrix"}
                </CardTitle>
                <CardDescription>
                  {parsedScore1.dataType === "NUMERIC"
                    ? "Distribution of matched score pairs showing correlation patterns"
                    : "Agreement matrix between categorical scores"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <Heatmap
                  data={heatmapData.cells}
                  rows={
                    parsedScore1.dataType === "NUMERIC"
                      ? 10
                      : (heatmapData.rows ?? 0)
                  }
                  cols={
                    parsedScore1.dataType === "NUMERIC"
                      ? 10
                      : (heatmapData.cols ?? 0)
                  }
                  rowLabels={heatmapData.rowLabels}
                  colLabels={heatmapData.colLabels}
                  xAxisLabel={`${parsedScore2.name} (${parsedScore2.source})`}
                  yAxisLabel={`${parsedScore1.name} (${parsedScore1.source})`}
                  renderTooltip={(cell) => (
                    <div className="space-y-1">
                      <p className="font-semibold">Count: {cell.value}</p>
                      {parsedScore1.dataType === "NUMERIC" ? (
                        <>
                          <p className="text-xs">
                            {parsedScore1.name}:{" "}
                            {(
                              cell.metadata?.yRange as [number, number]
                            )?.[0]?.toFixed(2)}{" "}
                            -{" "}
                            {(
                              cell.metadata?.yRange as [number, number]
                            )?.[1]?.toFixed(2)}
                          </p>
                          <p className="text-xs">
                            {parsedScore2.name}:{" "}
                            {(
                              cell.metadata?.xRange as [number, number]
                            )?.[0]?.toFixed(2)}{" "}
                            -{" "}
                            {(
                              cell.metadata?.xRange as [number, number]
                            )?.[1]?.toFixed(2)}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs">
                          {cell.metadata?.rowCategory as string} →{" "}
                          {cell.metadata?.colCategory as string}
                        </p>
                      )}
                      <p className="text-xs">
                        {((cell.metadata?.percentage as number) ?? 0).toFixed(
                          1,
                        )}
                        % of matched pairs
                      </p>
                    </div>
                  )}
                />
                <HeatmapLegend
                  min={0}
                  max={Math.max(...heatmapData.cells.map((c) => c.value))}
                  variant="chart1"
                  title="Count"
                  orientation="horizontal"
                />
              </CardContent>
            </Card>

            {/* Statistics (for numeric scores) */}
            {parsedScore1.dataType === "NUMERIC" &&
              analyticsData.statistics && (
                <Card>
                  <CardHeader>
                    <CardTitle>Statistical Analysis</CardTitle>
                    <CardDescription>
                      Correlation and error metrics for matched score pairs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Pearson Correlation
                        </p>
                        <p className="text-lg font-semibold">
                          {analyticsData.statistics.pearsonCorrelation?.toFixed(
                            3,
                          ) ?? "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Mean Absolute Error
                        </p>
                        <p className="text-lg font-semibold">
                          {analyticsData.statistics.mae?.toFixed(3) ?? "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">RMSE</p>
                        <p className="text-lg font-semibold">
                          {analyticsData.statistics.rmse?.toFixed(3) ?? "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Matched Pairs
                        </p>
                        <p className="text-lg font-semibold">
                          {analyticsData.statistics.matchedCount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-muted/20 p-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">No Data Available</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                No matching score pairs found for the selected time range and
                filters.
              </p>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
