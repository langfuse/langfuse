/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { BarList } from "@tremor/react";
import type { FilterState } from "@/src/features/filters/types";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { Label } from "@radix-ui/react-label";

export const SchoolUsageChart = ({
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

  const uniqueSchools = api.keyAnalytics.uniqueSchools.useQuery({
    projectId,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    agg: timeFilter[0]?.value ?? "1 month",
  });

  const popularSchoolByUsers = api.keyAnalytics.popularSchoolByUsers.useQuery({
    projectId,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    agg: timeFilter[0]?.value ?? "1 month",
  });

  const popularSchoolByTraces = api.keyAnalytics.popularSchoolByTraces.useQuery(
    {
      projectId,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      agg: timeFilter[0]?.value ?? "1 month",
    },
  );

  const convertDataBigIntsToNumbers = (
    data: { usercount?: bigint; tracecount?: bigint }[],
  ): { usercount: number; tracecount: number }[] =>
    data.map((item) => ({
      ...item,
      usercount: Number(item?.usercount ?? 0),
      tracecount: Number(item?.tracecount ?? 0),
    })) as { usercount: number; tracecount: number }[];

  const convertedUserCountData: { usercount: number; tracecount: number }[] =
    convertDataBigIntsToNumbers(popularSchoolByUsers.data ?? []);
  const maxNumberOfEntries: { expanded: number; collapsed: number } = {
    expanded: 5,
    collapsed: 3,
  };

  const convertedTraceCountData: { usercount: number; tracecount: number }[] =
    convertDataBigIntsToNumbers(popularSchoolByTraces.data ?? []);

  const adjustedUserData = expandedState.users
    ? convertedUserCountData.slice(0, maxNumberOfEntries.expanded)
    : convertedUserCountData.slice(0, maxNumberOfEntries.collapsed);

  const adjustedTraceData = expandedState.traces
    ? convertedTraceCountData.slice(0, maxNumberOfEntries.expanded)
    : convertedTraceCountData.slice(0, maxNumberOfEntries.collapsed);

  const toggleExpandedState = (chart: string) => {
    setExpandedState((prevState) => ({
      ...prevState,
      [chart]: !prevState[chart],
    }));
  };

  return (
    <DashboardCard
      className={className}
      title="School Usage"
      isLoading={
        uniqueSchools.isLoading ||
        popularSchoolByUsers.isLoading ||
        popularSchoolByTraces.isLoading
      }
    >
      <TotalMetric
        metric={uniqueSchools.data ?? 0}
        description="Organisation(s) using the platform"
      />
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <Label className="mt-4">Top Schools by Number of Users</Label>
          {adjustedUserData && adjustedUserData.length > 0 ? (
            <BarList
              data={adjustedUserData.map((school) => ({
                name: school.organisation_name,
                value: school.usercount,
              }))}
              valueFormatter={(number: number) =>
                Number.isFinite(number)
                  ? Intl.NumberFormat("en-US").format(number)
                  : "0"
              }
              className="mt-2"
              showAnimation={true}
              color="blue"
            />
          ) : (
            <NoData noDataText="No school usage data available" />
          )}
          <ExpandListButton
            isExpanded={expandedState.users}
            setExpanded={() => toggleExpandedState("users")}
            totalLength={convertedUserCountData.length}
            maxLength={maxNumberOfEntries.collapsed}
            expandText="Show more"
          />
        </div>
        <div>
          <Label className="mt-4">Top Schools by Number of Traces</Label>
          {adjustedTraceData && adjustedTraceData.length > 0 ? (
            <BarList
              data={adjustedTraceData.map((school) => ({
                name: school.organisation_name,
                value: school.tracecount,
              }))}
              valueFormatter={(number) =>
                Number.isFinite(number)
                  ? Intl.NumberFormat("en-US").format(number)
                  : "0"
              }
              className="mt-2"
              showAnimation={true}
              color="blue"
            />
          ) : (
            <NoData noDataText="No school usage data available" />
          )}
          <ExpandListButton
            isExpanded={expandedState.traces}
            setExpanded={() => toggleExpandedState("traces")}
            totalLength={convertedTraceCountData.length}
            maxLength={maxNumberOfEntries.collapsed}
            expandText="Show more"
          />
        </div>
      </div>
    </DashboardCard>
  );
};
