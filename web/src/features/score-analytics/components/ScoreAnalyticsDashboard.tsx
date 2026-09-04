import { StatisticsCard } from "./cards/StatisticsCard";
import { TimelineChartCard } from "./cards/TimelineChartCard";
import { DistributionNumericCard } from "./cards/DistributionNumericCard";
import { DistributionCategoricalCard } from "./cards/DistributionCategoricalCard";
import { DistributionBooleanCard } from "./cards/DistributionBooleanCard";
import { HeatmapCard } from "./cards/HeatmapCard";
import {
  useScoreAnalytics,
  type ScoreAnalyticsContextValue,
} from "./ScoreAnalyticsProvider";
import { ScoreAnalyticsNoticeBanner } from "./ScoreAnalyticsNoticeBanner";
import { useEffect, useState } from "react";

type ScoreAnalyticsNotice =
  | {
      status: "loading";
      estimate: ScoreAnalyticsContextValue["estimate"];
    }
  | {
      status: "sampled";
      data: NonNullable<ScoreAnalyticsContextValue["data"]>;
    };

function useScoreAnalyticsNotice(): ScoreAnalyticsNotice | undefined {
  const { data, estimate, isEstimating, isLoading } = useScoreAnalytics();
  const [showLoadingBanner, setShowLoadingBanner] = useState(false);

  useEffect(() => {
    if (isEstimating || (estimate && isLoading)) {
      const timer = setTimeout(() => {
        setShowLoadingBanner(true);
      }, 1500);

      return () => clearTimeout(timer);
    }

    setShowLoadingBanner(false);
  }, [isEstimating, estimate, isLoading]);

  const isLoadingAnalytics = isEstimating || Boolean(estimate && isLoading);
  const showLargeDataset = Boolean(
    estimate && estimate.estimatedMatchedCount > 100_000,
  );

  if (isLoadingAnalytics && (showLoadingBanner || showLargeDataset)) {
    return { status: "loading", estimate };
  }

  if (!isLoadingAnalytics && estimate && data?.samplingMetadata.isSampled) {
    return { status: "sampled", data };
  }

  return undefined;
}

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
  const notice = useScoreAnalyticsNotice();

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
      {notice?.status === "loading" ? (
        <ScoreAnalyticsNoticeBanner
          variant="loading"
          estimate={notice.estimate}
        />
      ) : notice?.status === "sampled" ? (
        <ScoreAnalyticsNoticeBanner variant="sampled" data={notice.data} />
      ) : null}

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
