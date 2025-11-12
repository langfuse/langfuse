import { StatisticsCard } from "./cards/StatisticsCard";
import { TimelineChartCard } from "./cards/TimelineChartCard";
import { DistributionNumericCard } from "./cards/DistributionNumericCard";
import { DistributionCategoricalCard } from "./cards/DistributionCategoricalCard";
import { DistributionBooleanCard } from "./cards/DistributionBooleanCard";
import { HeatmapCard } from "./cards/HeatmapCard";
import { useScoreAnalytics } from "./ScoreAnalyticsProvider";
import { ScoreAnalyticsNoticeBanner } from "./ScoreAnalyticsNoticeBanner";

/**
 * ScoreAnalyticsDashboard - Layout component for score analytics
 *
 * Renders a 2x2 responsive grid containing all 4 analytics cards:
 * - StatisticsCard: Summary metrics
 * - TimelineChartCard: Time series trends
 * - DistributionCard: Score distributions (type-specific routing)
 * - HeatmapCard: Score comparisons
 *
 * The DistributionCard is now routed based on data type:
 * - NUMERIC → DistributionNumericCard
 * - CATEGORICAL → DistributionCategoricalCard
 * - BOOLEAN → DistributionBooleanCard
 *
 * All cards consume data from ScoreAnalyticsProvider context,
 * so this component only handles layout and routing.
 *
 * Layout:
 * - Mobile/Tablet (< xl): Stacked vertically (1 column)
 * - Desktop (>= xl): 2x2 grid (2 columns)
 */
export function ScoreAnalyticsDashboard() {
  const { data } = useScoreAnalytics();

  // Route to appropriate distribution card based on data type
  const renderDistributionCard = () => {
    if (!data) {
      // Show loading state - use numeric card as default
      return <DistributionNumericCard />;
    }

    const { dataType } = data.metadata;

    switch (dataType) {
      case "NUMERIC":
        return <DistributionNumericCard />;
      case "CATEGORICAL":
        return <DistributionCategoricalCard />;
      case "BOOLEAN":
        return <DistributionBooleanCard />;
      default:
        // Fallback to numeric card
        return <DistributionNumericCard />;
    }
  };

  return (
    <>
      {/* Unified notice banner (transitions: loading → sampling notice) */}
      <ScoreAnalyticsNoticeBanner />

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <StatisticsCard />
        <TimelineChartCard />
        {renderDistributionCard()}
        <HeatmapCard />
      </div>
    </>
  );
}
