import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { BarList } from "@tremor/react";
import type { FilterState } from "@/src/features/filters/types";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { Label } from "@radix-ui/react-label";

export const OrganizationCostChart = ({
  className,
  projectId,
  globalFilterState,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const [expandedState, setExpandedState] = useState(false);

  const timeFilter =
    globalFilterState.map((f) =>
      f.type === "datetime" ? { ...f, column: "timestamp" } : f,
    ) ?? [];

  const averageCostPerOrganization = api.keyAnalytics.averageCostPerOrganization.useQuery({
    projectId,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    agg: timeFilter[0]?.value ?? "1 month",
  });

  const maxNumberOfEntries: { expanded: number; collapsed: number } = {
    expanded: 10,
    collapsed: 5,
  };

  const adjustedData = expandedState
    ? averageCostPerOrganization.data?.slice(0, maxNumberOfEntries.expanded)
    : averageCostPerOrganization.data?.slice(0, maxNumberOfEntries.collapsed);

  const toggleExpandedState = () => {
    setExpandedState((prevState) => !prevState);
  };

  return (
    <DashboardCard
      className={className}
      title="Average Cost per Organization"
      isLoading={averageCostPerOrganization.isLoading}
    >
      <TotalMetric
        metric={averageCostPerOrganization.data?.length ?? 0}
        description="Organisation(s) with cost data"
      />
      <div className="mt-6">
        <Label className="mt-4">Top Organizations by Average Cost</Label>
        {adjustedData && adjustedData.length > 0 ? (
          <BarList
            data={adjustedData.map((org) => ({
              name: org.organisationName,
              value: org.averageCost,
            }))}
            valueFormatter={(number: number) =>
              Number.isFinite(number)
                ? `$${number.toFixed(2)}`
                : "$0.00"
            }
            className="mt-2"
            showAnimation={true}
            color="blue"
          />
        ) : (
          <NoData noDataText="No organization cost data available" />
        )}
        <ExpandListButton
          isExpanded={expandedState}
          setExpanded={toggleExpandedState}
          totalLength={averageCostPerOrganization.data?.length ?? 0}
          maxLength={maxNumberOfEntries.collapsed}
          expandText="Show more"
        />
      </div>
    </DashboardCard>
  );
};