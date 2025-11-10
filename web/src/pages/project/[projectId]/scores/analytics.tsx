import { useRouter } from "next/router";
import { useMemo, useEffect, useRef } from "react";
import Page from "@/src/components/layouts/page";
import {
  getScoresTabs,
  SCORES_TABS,
} from "@/src/features/navigation/utils/scores-tabs";
import { useAnalyticsUrlState } from "@/src/features/scores/components/score-analytics/libs/analytics-url-state";
import { type ScoreOption } from "@/src/features/scores/components/score-analytics/components/charts/ScoreCombobox";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import {
  toAbsoluteTimeRange,
  getOptimalInterval,
} from "@/src/utils/date-range-utils";
import { BarChart3, Loader2 } from "lucide-react";
import { api } from "@/src/utils/api";
import {
  ScoreAnalyticsProvider,
  type DataType,
} from "@/src/features/scores/components/score-analytics/components/ScoreAnalyticsProvider";
import { ScoreAnalyticsHeader } from "@/src/features/scores/components/score-analytics/components/ScoreAnalyticsHeader";
import { ScoreAnalyticsDashboard } from "@/src/features/scores/components/score-analytics/components/ScoreAnalyticsDashboard";

/**
 * Score Analytics V2 - Refactored Architecture
 *
 * This page uses the new Provider + Hook + Smart Cards pattern:
 * - ScoreAnalyticsProvider: Fetches & transforms data once, exposes via Context
 * - ScoreAnalyticsHeader: Score selectors, filters, time range picker
 * - ScoreAnalyticsDashboard: 2x2 responsive grid with 4 smart cards
 * - Smart Cards: Self-contained components that consume Provider context
 *   - StatisticsCard: Summary metrics and comparison stats
 *   - TimelineChartCard: Time series trends
 *   - DistributionChartCard: Score distributions
 *   - HeatmapCard: Score comparison heatmaps
 *
 * Benefits over old implementation:
 * - Single data fetch (no prop drilling)
 * - Eliminated ~400 lines of duplicated code
 * - Type-safe with proper interfaces
 * - Clean separation of concerns
 * - Easy to test and maintain
 */
export default function ScoresAnalyticsV2Page() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const urlStateHook = useAnalyticsUrlState();
  const { state: urlState, setScore2 } = urlStateHook;

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

  // Determine which score types are compatible with score1
  // Same-type pairing only: NUMERIC with NUMERIC, BOOLEAN with BOOLEAN, CATEGORICAL with CATEGORICAL
  const compatibleScore2DataTypes = useMemo(() => {
    if (!score1DataType) return undefined;

    // Only allow same-type pairing
    return [score1DataType];
  }, [score1DataType]);

  // Clear score2 when score1's dataType changes
  const prevScore1DataTypeRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Skip on initial render
    if (prevScore1DataTypeRef.current === undefined) {
      prevScore1DataTypeRef.current = score1DataType;
      return;
    }

    // If dataType has changed and there's a score2 selected, clear it
    if (prevScore1DataTypeRef.current !== score1DataType && urlState.score2) {
      setScore2(undefined);
    }

    prevScore1DataTypeRef.current = score1DataType;
  }, [score1DataType, urlState.score2, setScore2]);

  // Parse score identifiers (format: "name-dataType-source")
  const parsedScore1 = useMemo(() => {
    if (!urlState.score1) return undefined;
    const selected = scoreOptions.find((opt) => opt.value === urlState.score1);
    if (!selected) return undefined;
    return {
      name: selected.name,
      dataType: selected.dataType as DataType,
      source: selected.source,
    };
  }, [urlState.score1, scoreOptions]);

  const parsedScore2 = useMemo(() => {
    if (!urlState.score2) return undefined;
    const selected = scoreOptions.find((opt) => opt.value === urlState.score2);
    if (!selected) return undefined;
    return {
      name: selected.name,
      dataType: selected.dataType as DataType,
      source: selected.source,
    };
  }, [urlState.score2, scoreOptions]);

  // Convert time range to absolute dates
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  // Calculate optimal interval based on time range
  const interval = useMemo(() => {
    if (!absoluteTimeRange) return { count: 1, unit: "day" as const };
    return getOptimalInterval(absoluteTimeRange.from, absoluteTimeRange.to);
  }, [absoluteTimeRange]);

  // Determine query params for Provider
  const queryParams = useMemo(() => {
    if (
      !parsedScore1 ||
      !projectId ||
      !absoluteTimeRange?.from ||
      !absoluteTimeRange?.to
    ) {
      return undefined;
    }

    return {
      projectId,
      score1: parsedScore1,
      score2: parsedScore2,
      fromTimestamp: absoluteTimeRange.from,
      toTimestamp: absoluteTimeRange.to,
      interval,
      objectType: urlState.objectType,
    };
  }, [
    parsedScore1,
    parsedScore2,
    projectId,
    absoluteTimeRange,
    interval,
    urlState.objectType,
  ]);

  // UI state flags
  const hasError = !!scoresError;
  const hasNoScores =
    !scoresLoading && scoreOptions.length === 0 && !scoresError;
  const hasNoSelection = !hasError && !hasNoScores && !urlState.score1;

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
      <div className="flex max-h-full flex-col gap-0">
        {/* Header Controls */}
        {!hasError && !hasNoScores && (
          <ScoreAnalyticsHeader
            scoreOptions={scoreOptions}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            compatibleScore2DataTypes={compatibleScore2DataTypes}
          />
        )}

        {/* Content Section */}
        <div className="max-h-full overflow-y-scroll p-4 pt-6">
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
            <div className="flex flex-col items-center justify-center gap-6 rounded-lg border bg-muted/20 p-12">
              <BarChart3 className="h-16 w-16 text-muted-foreground" />
              <div className="max-w-2xl text-center">
                <h3 className="text-2xl font-semibold">Select a Score</h3>
                <p className="mt-3 text-base text-muted-foreground">
                  Choose one or two scores from the dropdowns above to view
                  analytics
                </p>
                <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-lg bg-background/50 p-4">
                    <p className="mb-1 font-semibold text-foreground">
                      Single score selected:
                    </p>
                    <p>View distribution and trends over time</p>
                  </div>
                  <div className="rounded-lg bg-background/50 p-4">
                    <p className="mb-1 font-semibold text-foreground">
                      Two scores selected:
                    </p>
                    <p>
                      Compare scores with heatmaps, correlation analysis, and
                      statistical metrics
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : queryParams ? (
            <ScoreAnalyticsProvider params={queryParams}>
              <ScoreAnalyticsDashboard />
            </ScoreAnalyticsProvider>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border p-12">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading analytics data...
              </p>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
