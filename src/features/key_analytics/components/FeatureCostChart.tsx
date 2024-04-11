import React from "react";
import { api } from "@/src/utils/api";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import type { FilterState } from "@/src/features/filters/types";

export const FeatureCostMetrics = ({
  className,
  projectId,
  globalFilterState,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const timeFilter =
    globalFilterState.map((f) =>
      f.type === "datetime" ? { ...f, column: "timestamp" } : f
    ) ?? [];

  const averageFeatureCosts = api.keyAnalytics.averageFeatureCosts.useQuery({
    projectId,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    agg: timeFilter[0]?.value ?? "1 month",
  });
  console.log('averageFeatureCosts', averageFeatureCosts)
  const formatCost = (cost: number | undefined) => {
    return cost ? `$${cost.toFixed(4)}` : "$0.00";
  };

  if (averageFeatureCosts.isLoading || !averageFeatureCosts.data) {
    return (
      <DashboardCard
        className={className}
        title="Average Cost per Request"
        isLoading={true}
      />
    );
  }

  return (
    <DashboardCard
      className={className}
      title="Average Cost per Request"
      isLoading={false}
    >
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {averageFeatureCosts.data.map((feature) => (
          <TotalMetric
            key={feature.traceName}
            description={feature.traceName}
            metric={formatCost(feature.averageCost)}
          />
        ))}
      </div>
    </DashboardCard>
  );
};