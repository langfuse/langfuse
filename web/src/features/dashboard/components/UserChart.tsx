import { api } from "@/src/utils/api";
import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { BarList } from "@tremor/react";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState } from "react";
import { totalCostDashboardFormatted } from "@/src/features/dashboard/lib/dashboard-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { useTranslation } from "next-i18next";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";

type BarChartDataPoint = {
  name: string;
  value: number;
};

export const UserChart = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
}) => {
  const { t } = useTranslation("common");
  const [isExpanded, setIsExpanded] = useState(false);
  const userCostQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "userId" }],
    metrics: [
      { measure: "totalCost", aggregation: "sum" },
      { measure: "count", aggregation: "count" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", globalFilterState),
      {
        column: "type",
        operator: "any of",
        value: getGenerationLikeTypes(),
        type: "stringOptions",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const user = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: userCostQuery,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  const traceCountQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "userId" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const traces = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: traceCountQuery,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  const transformedNumberOfTraces: BarChartDataPoint[] = traces.data
    ? traces.data
        .filter((item) => item.userId !== undefined)
        .map((item) => {
          return {
            name: item.userId as string,
            value: item.count_count ? Number(item.count_count) : 0,
          };
        })
    : [];

  const transformedCost: BarChartDataPoint[] = user.data
    ? user.data
        .filter((item) => item.userId !== undefined)
        .map((item) => {
          return {
            name:
              (item.userId as string | null | undefined) ??
              t("dashboard.unknown"),
            value: item.sum_totalCost ? Number(item.sum_totalCost) : 0,
          };
        })
    : [];

  const totalCost = user.data?.reduce(
    (acc, curr) => acc + (Number(curr.sum_totalCost) || 0),
    0,
  );

  const totalTraces = traces.data?.reduce(
    (acc, curr) => acc + (Number(curr.count_count) || 0),
    0,
  );

  const maxNumberOfEntries = { collapsed: 5, expanded: 20 } as const;

  const localUsdFormatter = (value: number) =>
    totalCostDashboardFormatted(value);

  const data = [
    {
      tabTitle: t("dashboard.cost"),
      data: isExpanded
        ? transformedCost.slice(0, maxNumberOfEntries.expanded)
        : transformedCost.slice(0, maxNumberOfEntries.collapsed),
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: t("dashboard.totalCost"),
      formatter: localUsdFormatter,
    },
    {
      tabTitle: t("dashboard.traces"),
      data: isExpanded
        ? transformedNumberOfTraces.slice(0, maxNumberOfEntries.expanded)
        : transformedNumberOfTraces.slice(0, maxNumberOfEntries.collapsed),
      totalMetric: totalTraces
        ? compactNumberFormatter(totalTraces)
        : compactNumberFormatter(0),
      metricDescription: t("dashboard.totalTracesTracked"),
    },
  ];

  return (
    <DashboardCard
      className={className}
      title={t("dashboard.userActivity")}
      isLoading={isLoading || user.isPending}
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            content: (
              <>
                {item.data.length > 0 ? (
                  <>
                    <TotalMetric
                      metric={item.totalMetric}
                      description={item.metricDescription}
                    />
                    <BarList
                      data={item.data}
                      valueFormatter={item.formatter}
                      className="mt-2"
                      showAnimation={true}
                      color={"indigo"}
                    />
                  </>
                ) : (
                  <NoDataOrLoading
                    isLoading={isLoading || user.isPending}
                    description={t("dashboard.userConsumptionDescription")}
                    href="https://langfuse.com/docs/observability/features/users"
                  />
                )}
              </>
            ),
          };
        })}
      />
      <ExpandListButton
        isExpanded={isExpanded}
        setExpanded={setIsExpanded}
        totalLength={transformedCost.length}
        maxLength={maxNumberOfEntries.collapsed}
        expandText={
          transformedCost.length > maxNumberOfEntries.expanded
            ? t("dashboard.showTop", { count: maxNumberOfEntries.expanded })
            : t("dashboard.showAll")
        }
      />
    </DashboardCard>
  );
};
