import { useRouter } from "next/router";
import { useMemo } from "react";
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
import { BarChart3 } from "lucide-react";

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

  // TODO: Replace with actual API call to fetch score options
  // This will be implemented in LF-1918 (tRPC API Endpoints)
  const scoreOptions: ScoreOption[] = useMemo(() => [], []);

  // Parse selected scores to get their data types
  const score1DataType = useMemo(() => {
    if (!urlState.score1) return undefined;
    const selected = scoreOptions.find((opt) => opt.value === urlState.score1);
    return selected?.dataType;
  }, [urlState.score1, scoreOptions]);

  const hasNoScores = scoreOptions.length === 0;
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
        {hasNoScores ? (
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
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border p-12">
            <p className="text-muted-foreground">
              Analytics visualizations will be displayed here
            </p>
            <p className="text-sm text-muted-foreground">
              (Implementation in progress: LF-1919, LF-1920, LF-1921)
            </p>
          </div>
        )}
      </div>
    </Page>
  );
}
