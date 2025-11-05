import { StatisticsCard } from "./cards/StatisticsCard";
import { TimelineChartCard } from "./cards/TimelineChartCard";
import { DistributionChartCard } from "./cards/DistributionChartCard";
import { HeatmapCard } from "./cards/HeatmapCard";

/**
 * ScoreAnalyticsDashboard - Layout component for score analytics
 *
 * Renders a 2x2 responsive grid containing all 4 analytics cards:
 * - StatisticsCard: Summary metrics
 * - TimelineChartCard: Time series trends
 * - DistributionChartCard: Score distributions
 * - HeatmapCard: Score comparisons
 *
 * All cards consume data from ScoreAnalyticsProvider context,
 * so this component only handles layout.
 *
 * Layout:
 * - Mobile (< lg): Stacked vertically (1 column)
 * - Desktop (>= lg): 2x2 grid (2 columns)
 */
export function ScoreAnalyticsDashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <StatisticsCard />
      <TimelineChartCard />
      <DistributionChartCard />
      <HeatmapCard />
    </div>
  );
}
