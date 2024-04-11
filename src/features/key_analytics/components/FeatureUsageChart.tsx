import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { BarList } from "@tremor/react";
import type { FilterState } from "@/src/features/filters/types";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import DocPopup from "@/src/components/layouts/doc-popup";

export const FeatureUsageChart = ({
  className,
  projectId,
  globalFilterState,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const timeFilter =
    globalFilterState.map((f) =>
      f.type === "datetime" ? { ...f, column: "timestamp" } : f,
    ) ?? [];

  const validAggregationOptions: (
    | "1 year"
    | "3 months"
    | "1 month"
    | "7 days"
    | "24 hours"
    | "1 hour"
    | "30 minutes"
  )[] = [
    "1 year",
    "3 months",
    "1 month",
    "7 days",
    "24 hours",
    "1 hour",
    "30 minutes",
  ];

  const selectedAggregationOption = timeFilter[0]?.value;
  const agg = validAggregationOptions.includes(selectedAggregationOption)
    ? selectedAggregationOption
    : "1 month";

  const featureUsageQuery = api.keyAnalytics.featureUsage.useQuery({
    projectId,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    agg,
  });

  const maxNumberOfEntries = { collapsed: 5, expanded: 20 };

  // Assuming featureUsageQuery.data might contain BigInt values
  const featureUsageData =
    featureUsageQuery.data?.map((feature) => ({
      name: feature.traceName,
      value: Number(feature.count), // Explicit conversion here
    })) ?? [];

  const adjustedData = isExpanded
    ? featureUsageData.slice(0, maxNumberOfEntries.expanded)
    : featureUsageData.slice(0, maxNumberOfEntries.collapsed);

  return (
    <DashboardCard
      className={className}
      title="Feature Usage"
      isLoading={featureUsageQuery.isLoading}
    >
      {adjustedData.length > 0 ? (
        <BarList
          data={adjustedData}
          valueFormatter={(number: unknown) =>
            Number.isFinite(number as number)
              ? Intl.NumberFormat("en-US").format(number as number)
              : "0"
          }
          className="mt-6"
          showAnimation={true}
          color="blue"
        />
      ) : (
        <NoData noDataText="No feature usage data available">
          <DocPopup
            description="Feature usage data shows the most used features based on the trace name."
            href="https://example.com/docs/feature-usage"
          />
        </NoData>
      )}
      <ExpandListButton
        isExpanded={isExpanded}
        setExpanded={setIsExpanded}
        totalLength={featureUsageData.length}
        maxLength={maxNumberOfEntries.collapsed}
        expandText={
          featureUsageData.length > maxNumberOfEntries.expanded
            ? `Show top ${maxNumberOfEntries.expanded}`
            : "Show all"
        }
      />
    </DashboardCard>
  );
};
