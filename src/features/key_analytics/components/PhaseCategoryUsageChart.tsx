import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { BarList } from "@tremor/react";
import type { FilterState } from "@/src/features/filters/types";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import DocPopup from "@/src/components/layouts/doc-popup";
import { Label } from "@radix-ui/react-label";

type ExpandedState = {
  users: boolean;
  traces: boolean;
};

export const PhaseCategoryUsageChart = ({
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

  const popularCategoriesQuery =
    api.keyAnalytics.popularOrganisationCategories.useQuery({
      projectId,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      agg,
    });

  const maxNumberOfEntries = { collapsed: 5, expanded: 20 };

  const formatData = (
    data: { category: string; count: number }[],
    countType: "userCount" | "traceCount",
  ) =>
    data.map((category) => ({
      name: category.category,
      value: Number(
        (category as unknown as { [key: string]: number })[countType] || 0,
      ),
    }));

  const userCountData = formatData(
    Array.isArray(popularCategoriesQuery.data?.popularCategoriesByUsers)
      ? popularCategoriesQuery.data.popularCategoriesByUsers.map(
          (category) => ({
            ...category,
            count: category.userCount,
          }),
        )
      : [],
    "userCount",
  );

  const traceCountData = formatData(
    Array.isArray(popularCategoriesQuery.data?.popularCategoriesByTraces)
      ? popularCategoriesQuery.data.popularCategoriesByTraces.map(
          (category) => ({
            ...category,
            count: category.traceCount,
          }),
        )
      : [],
    "traceCount",
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
      title="Phase Category Usage"
      isLoading={popularCategoriesQuery.isLoading}
    >
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <Label className="mt-4">Top Categories by Number of Users</Label>
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
            <NoData noDataText="No phase category usage data available">
              <DocPopup
                description="Phase category usage data shows the most popular organisation phase categories based on the number of users."
                href="https://example.com/docs/phase-category-usage"
              />
            </NoData>
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
          <Label className="mt-4">Top Categories by Number of Traces</Label>
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
            <NoData noDataText="No phase category usage data available">
              <DocPopup
                description="Phase category usage data shows the most popular organisation phase categories based on the number of traces."
                href="https://example.com/docs/phase-category-usage"
              />
            </NoData>
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
