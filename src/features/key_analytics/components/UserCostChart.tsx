import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { BarList } from "@tremor/react";
import type { FilterState } from "@/src/features/filters/types";
import { Label } from "@radix-ui/react-label";

export const AverageCostAndRoleChart = ({
  className,
  projectId,
  globalFilterState,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const timeFilter = globalFilterState.map((f) => f.type === "datetime" ? { ...f, column: "timestamp" } : f) ?? [];

  const averageFeatureCosts = api.keyAnalytics.averageFeatureCosts.useQuery({
    projectId,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
    agg: timeFilter[0]?.value ?? "1 month",
  });

  const averageCostPerRole = api.keyAnalytics.averageCostPerUser.useQuery({
    projectId,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
    agg: timeFilter[0]?.value ?? "1 month",
  });

  // Assuming the conversion function to handle bigint or any necessary formatting
  const convertDataForChart = (data: { roleName?: string; averageCost?: number }[]) =>
    data.map((item) => ({
      name: item.roleName ?? "Unknown",
      value: item.averageCost ?? 0,
    }));

  const featureCostData = convertDataForChart(averageFeatureCosts.data ?? []);
  const roleCostData = convertDataForChart(averageCostPerRole.data ?? []);

  return (
    <DashboardCard
      className={className}
      title="Cost Insights"
      isLoading={
        averageFeatureCosts.isLoading ||
        averageCostPerRole.isLoading
      }
    >
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <Label className="mt-4">Average Cost per Feature</Label>
          {featureCostData.length > 0 ? (
            <BarList
              data={featureCostData}
              valueFormatter={(value: number) => `$${value.toFixed(2)}`}
              className="mt-2"
              showAnimation={true}
              color="blue"
            />
          ) : (
            <NoData noDataText="No feature cost data available" />
          )}
        </div>
        <div>
          <Label className="mt-4">Average Cost by User Role</Label>
          {roleCostData.length > 0 ? (
            <BarList
              data={roleCostData}
              valueFormatter={(value: number) => `$${value.toFixed(2)}`}
              className="mt-2"
              showAnimation={true}
              color="green"
            />
          ) : (
            <NoData noDataText="No role cost data available" />
          )}
        </div>
      </div>
    </DashboardCard>
  );
};
