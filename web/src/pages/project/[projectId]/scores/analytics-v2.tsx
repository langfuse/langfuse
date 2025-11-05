import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import {
  getScoresTabs,
  SCORES_TABS,
} from "@/src/features/navigation/utils/scores-tabs";
import { Card } from "@/src/components/ui/card";
import { AlertCircle, BarChart3, TrendingUp, Grid3x3 } from "lucide-react";

/**
 * Score Analytics V2 - Refactored Architecture
 *
 * This page demonstrates the new Provider + Hook + Smart Cards pattern.
 * Current state: Skeleton/placeholder (components not yet built)
 *
 * Architecture:
 * - useScoreAnalyticsQuery: Fetches & transforms data once (Phase 3 - TODO)
 * - ScoreAnalyticsProvider: Exposes via Context (Phase 4 - TODO)
 * - ScoreAnalyticsDashboard: 2x2 grid layout (Phase 6 - TODO)
 * - Smart Cards: Self-contained components (Phase 5 - TODO)
 *   - StatisticsCard
 *   - TimelineChartCard
 *   - DistributionChartCard
 *   - HeatmapCard
 *
 * See: /features/scores/components/score-analytics/plan.md
 */
export default function ScoresAnalyticsV2Page() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

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
          activeTab: SCORES_TABS.ANALYTICS_V2,
        },
      }}
    >
      <div className="flex max-h-full flex-col gap-6 p-6">
        {/* Architecture Notice */}
        <Card className="border-blue-500/50 bg-blue-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-blue-500" />
            <div className="space-y-2">
              <h3 className="font-semibold text-blue-500">
                New Architecture Preview
              </h3>
              <p className="text-sm text-muted-foreground">
                This page demonstrates the refactored Provider + Hook + Smart
                Cards pattern. Components are being built incrementally (Phases
                3-6).
              </p>
              <p className="text-xs text-muted-foreground">
                See{" "}
                <code>/features/scores/components/score-analytics/plan.md</code>{" "}
                for details.
              </p>
            </div>
          </div>
        </Card>

        {/* Placeholder: Header Controls (Phase 6) */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-[200px] rounded border border-dashed border-muted-foreground/30 bg-muted/20" />
              <div className="h-8 w-[200px] rounded border border-dashed border-muted-foreground/30 bg-muted/20" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-[140px] rounded border border-dashed border-muted-foreground/30 bg-muted/20" />
              <div className="h-8 w-[180px] rounded border border-dashed border-muted-foreground/30 bg-muted/20" />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <strong>ScoreAnalyticsHeader</strong> (TODO): Score selectors,
            object type filter, time range picker
          </p>
        </Card>

        {/* Placeholder: Dashboard Grid (Phase 6) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Statistics Card (Phase 5) */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Statistics</h3>
            </div>
            <div className="space-y-3">
              <div className="h-20 rounded border border-dashed border-muted-foreground/30 bg-muted/10" />
              <div className="h-20 rounded border border-dashed border-muted-foreground/30 bg-muted/10" />
              <div className="h-20 rounded border border-dashed border-muted-foreground/30 bg-muted/10" />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              <strong>StatisticsCard</strong> (TODO): Mean, median, mode, std
              dev, correlation
            </p>
          </Card>

          {/* Timeline Chart Card (Phase 5) */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Timeline</h3>
            </div>
            <div className="flex h-[320px] items-center justify-center rounded border border-dashed border-muted-foreground/30 bg-muted/10">
              <p className="text-sm text-muted-foreground">Chart Area</p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              <strong>TimelineChartCard</strong> (TODO): Scores over time
              (line/area chart)
            </p>
          </Card>

          {/* Distribution Chart Card (Phase 5) */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Distribution</h3>
            </div>
            <div className="flex h-[320px] items-center justify-center rounded border border-dashed border-muted-foreground/30 bg-muted/10">
              <p className="text-sm text-muted-foreground">Chart Area</p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              <strong>DistributionChartCard</strong> (TODO): Histogram/bar chart
              of score distribution
            </p>
          </Card>

          {/* Heatmap Card (Phase 5) */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Grid3x3 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Heatmap</h3>
            </div>
            <div className="flex h-[320px] items-center justify-center rounded border border-dashed border-muted-foreground/30 bg-muted/10">
              <p className="text-sm text-muted-foreground">Heatmap Area</p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              <strong>HeatmapCard</strong> (TODO): Score comparison heatmap
              (numeric bins or confusion matrix)
            </p>
          </Card>
        </div>

        {/* Implementation Status */}
        <Card className="p-4">
          <h3 className="mb-3 font-semibold">Implementation Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">
                Phase 1: Setup (Complete)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">
                Phase 2: Transformers (Complete)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-muted-foreground">
                Phase 3: Data Hook (In Progress)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-muted-foreground">
                Phase 4: Context Provider (TODO)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-muted-foreground">
                Phase 5: Card Components (TODO)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-muted-foreground">
                Phase 6: Dashboard Layout (TODO)
              </span>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
