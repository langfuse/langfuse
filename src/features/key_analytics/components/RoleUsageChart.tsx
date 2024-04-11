import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { BarList } from "@tremor/react";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import type { FilterState } from "@/src/features/filters/types";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { Label } from "@radix-ui/react-label";
type ExpandedState = {
  users: boolean;
  traces: boolean;
};
export const PopularUserRolesChart = ({
  className,
  projectId,
  globalFilterState,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const [expandedState, setExpandedState] = useState({
    users: false,
    traces: false,
  });

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
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const agg = validAggregationOptions.includes(selectedAggregationOption)
    ? selectedAggregationOption
    : "1 month";

  const popularUserRoles = api.keyAnalytics.popularUserRoles.useQuery({
    projectId,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    agg,
  });

  const maxNumberOfEntries = { collapsed: 5, expanded: 20 };
  console.log("popularUserRoles: ", popularUserRoles);

  const formatData = (
    data: { user_role: string; userCount: number; traceCount?: number }[],
  ) =>
    data.map((role) => ({
      name: role.user_role,
      value: Number(role.userCount || role.traceCount || 0),
    }));

  const userCountData = formatData(
    popularUserRoles.data?.popularRolesByUsers ?? [],
  );
  const traceCountData = formatData(
    popularUserRoles.data?.popularRolesByTraces.map((role) => ({
      ...role,
      userCount: 0,
    })) ?? [],
  );

  const adjustedUserData = expandedState.users
    ? userCountData.slice(0, maxNumberOfEntries.expanded)
    : userCountData.slice(0, maxNumberOfEntries.collapsed);

  const adjustedTraceData = expandedState.traces
    ? traceCountData.slice(0, maxNumberOfEntries.expanded)
    : traceCountData.slice(0, maxNumberOfEntries.collapsed);

  const toggleExpandedState = (chart: keyof ExpandedState) => {
    setExpandedState((prevState: ExpandedState) => ({
      ...prevState,
      [chart]: !prevState[chart],
    }));
  };

  return (
    <DashboardCard
      className={className}
      title="Role Usage"
      isLoading={popularUserRoles.isLoading}
    >
      <TotalMetric
        metric={Number(popularUserRoles.data?.totalUsers ?? 0)}
        description="Total users"
      />
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <Label className="mt-4">Top Roles by Number of Users</Label>
          {adjustedUserData.length > 0 ? (
            <BarList
              data={adjustedUserData}
              valueFormatter={(number: unknown) =>
                Number.isFinite(number as number)
                  ? Intl.NumberFormat("en-US").format(number as number)
                  : "0"
              }
              className="mt-2"
              showAnimation={true}
              color="blue"
            />
          ) : (
            <NoData noDataText="No role usage data available" />
          )}
          <ExpandListButton
            isExpanded={expandedState.users}
            setExpanded={() => toggleExpandedState("users")}
            totalLength={userCountData.length}
            maxLength={maxNumberOfEntries.collapsed}
            expandText="Show more"
          />
        </div>
        <div>
          <Label className="mt-4">Top Roles by Number of Traces</Label>
          {adjustedTraceData.length > 0 ? (
            <BarList
              data={adjustedTraceData}
              valueFormatter={(number: unknown) =>
                Number.isFinite(number)
                  ? Intl.NumberFormat("en-US").format(number as number)
                  : "0"
              }
              className="mt-2"
              showAnimation={true}
              color="blue"
            />
          ) : (
            <NoData noDataText="No role usage data available" />
          )}
          <ExpandListButton
            isExpanded={expandedState.traces}
            setExpanded={() => toggleExpandedState("traces")}
            totalLength={traceCountData.length}
            maxLength={maxNumberOfEntries.collapsed}
            expandText="Show more"
          />
        </div>
      </div>
    </DashboardCard>
  );
};
