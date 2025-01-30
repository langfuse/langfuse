import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";

import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Button } from "@/src/components/ui/button";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
  InputCommandSeparator,
} from "@/src/components/ui/input-command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { env } from "@/src/env.mjs";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  getAllModels,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { TabComponent } from "@/src/features/dashboard/components/TabsComponent";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { totalCostDashboardFormatted } from "@/src/features/dashboard/lib/dashboard-utils";
import { api } from "@/src/utils/api";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { type FilterState } from "@langfuse/shared";

type ModelUsageReturnType = {
  startTime: string;
  units: Record<string, number>;
  cost: Record<string, number>;
  model: string;
};

export const ModelUsageChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DashboardDateRangeAggregationOption;
}) => {
  const allModels = getAllModels(projectId, globalFilterState);

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [firstAllModelUpdate, setFirstAllModelUpdate] = useState(true);

  const isAllSelected = selectedModels.length === allModels.length;
  const buttonText = isAllSelected
    ? "All models"
    : `${selectedModels.length} selected`;

  const handleSelectAll = () => {
    setSelectedModels(isAllSelected ? [] : [...allModels]);
  };

  const queryResult = api.dashboard.chart.useQuery(
    {
      projectId,
      from: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION // Langfuse Cloud has already completed the cost backfill job, thus cost can be pulled directly from obs. table
        ? "traces_observations"
        : "traces_observationsview",
      select: [
        { column: "totalTokens", agg: "SUM" },
        { column: "calculatedTotalCost", agg: "SUM" },
        { column: "model" },
      ],
      filter: [
        ...globalFilterState,
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
        ...(!isAllSelected
          ? [
              {
                type: "stringOptions",
                column: "model",
                operator: "any of",
                value: selectedModels,
              } as const,
            ]
          : []),
      ],
      groupBy: [
        {
          type: "datetime",
          column: "startTime",
          temporalUnit: dashboardDateRangeAggregationSettings[agg].date_trunc,
        },
        {
          type: "string",
          column: "model",
        },
      ],
      orderBy: [
        { column: "calculatedTotalCost", direction: "DESC", agg: "SUM" },
      ],
      queryName: "observations-usage-timeseries",
    },
    {
      enabled: selectedModels.length > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  useEffect(() => {
    if (firstAllModelUpdate && allModels.length > 0) {
      setSelectedModels(allModels);
      setFirstAllModelUpdate(false);
    }
  }, [allModels, firstAllModelUpdate]);

  const typedData = (queryResult.data as ModelUsageReturnType[]) ?? [];

  const allUsageUnits = [
    ...new Set(typedData.flatMap((r) => Object.keys(r.units))),
  ];

  const dates = typedData.flatMap((r) => new Date(r.startTime));

  const usageTypeMap = new Map<
    string,
    {
      units: number;
      cost: number;
      usageType: string;
      model: string;
    }[]
  >();

  dates?.forEach((d) => {
    allModels.forEach((m) => {
      allUsageUnits.forEach((uu) => {
        const existingEntry = typedData.find(
          (td) =>
            new Date(td.startTime).getTime() === d.getTime() && td.model === m,
        );

        if (!existingEntry) {
          const newEntry = {
            startTime: d.toString(),
            model: m,
            units: { [uu]: 0 },
            cost: { [uu]: 0 },
          };
          typedData.push(newEntry);

          // Add the new entry to usageTypeMap
          usageTypeMap.set(uu, [
            ...(usageTypeMap.get(uu) ?? []),
            {
              ...newEntry,
              units: 0,
              cost: 0,
              usageType: uu,
            },
          ]);
        }

        if (existingEntry) {
          usageTypeMap.set(uu, [
            ...(usageTypeMap.get(uu) ?? []),
            {
              ...existingEntry,
              units: existingEntry.units[uu],
              cost: existingEntry.cost[uu],
              usageType: uu,
            },
          ]);
        }
      });
    });
  });

  const usageData = Array.from(usageTypeMap.values()).flat();
  const currentModels = [
    ...new Set(usageData.map((row) => row.model).filter(Boolean)),
  ];

  const unitsByType =
    usageData && allModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(usageData, "startTime", [
            {
              uniqueIdentifierColumns: [{ accessor: "usageType" }],
              valueColumn: "units",
            },
          ]),
          Array.from(usageTypeMap.keys()),
        )
      : [];

  const unitsByModel =
    usageData && allModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(usageData, "startTime", [
            {
              uniqueIdentifierColumns: [{ accessor: "model" }],
              valueColumn: "units",
            },
          ]),
          currentModels,
        )
      : [];

  const costByType =
    usageData && allModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(usageData, "startTime", [
            {
              uniqueIdentifierColumns: [{ accessor: "usageType" }],
              valueColumn: "cost",
            },
          ]),
          Array.from(usageTypeMap.keys()),
        )
      : [];

  const costByModel =
    usageData && allModels.length > 0
      ? fillMissingValuesAndTransform(
          extractTimeSeriesData(usageData, "startTime", [
            {
              uniqueIdentifierColumns: [{ accessor: "model" }],
              valueColumn: "cost",
            },
          ]),
          currentModels,
        )
      : [];

  const totalCost = usageData?.reduce(
    (acc, curr) =>
      acc +
      (curr.usageType === "total" && !isNaN(curr.cost as number)
        ? (curr.cost as number)
        : 0),
    0,
  );

  const totalTokens = usageData?.reduce(
    (acc, curr) =>
      acc +
      (curr.usageType === "total" && !isNaN(curr.units as number)
        ? (curr.units as number)
        : 0),
    0,
  );

  // had to add this function as tremor under the hodd adds more variables
  // to the function call which would break usdFormatter.
  const oneValueUsdFormatter = (value: number) => {
    return totalCostDashboardFormatted(value);
  };

  const data = [
    {
      tabTitle: "Cost by model",
      data: costByModel,
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: `Cost`,
      formatter: oneValueUsdFormatter,
    },
    {
      tabTitle: "Cost by type",
      data: costByType,
      totalMetric: totalCostDashboardFormatted(totalCost),
      metricDescription: `Cost`,
      formatter: oneValueUsdFormatter,
    },
    {
      tabTitle: "Units by model",
      data: unitsByModel,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Units`,
    },
    {
      tabTitle: "Units by type",
      data: unitsByType,
      totalMetric: totalTokens
        ? compactNumberFormatter(totalTokens)
        : compactNumberFormatter(0),
      metricDescription: `Units`,
    },
  ];

  return (
    <DashboardCard
      className={className}
      title="Model Usage"
      isLoading={queryResult.isLoading && selectedModels.length > 0}
      headerRight={
        <div className="flex items-center justify-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-56 justify-between"
              >
                {buttonText}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0">
              <InputCommand>
                <InputCommandInput placeholder="Search models..." />
                <InputCommandEmpty>No model found.</InputCommandEmpty>
                <InputCommandGroup>
                  <InputCommandItem onSelect={handleSelectAll}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isAllSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span>
                      <p className="font-semibold">Select All</p>
                    </span>
                  </InputCommandItem>
                  <InputCommandSeparator className="my-1" />
                  <InputCommandList>
                    {allModels.map((model) => (
                      <InputCommandItem
                        key={model}
                        onSelect={() => {
                          setSelectedModels((prev) =>
                            prev.includes(model)
                              ? prev.filter((m) => m !== model)
                              : [...prev, model],
                          );
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedModels.includes(model)
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        {!model || model === "" ? <i>none</i> : model}
                      </InputCommandItem>
                    ))}
                  </InputCommandList>
                </InputCommandGroup>
              </InputCommand>
            </PopoverContent>
          </Popover>
        </div>
      }
    >
      <TabComponent
        tabs={data.map((item) => {
          return {
            tabTitle: item.tabTitle,
            content: (
              <>
                <TotalMetric
                  metric={item.totalMetric}
                  description={item.metricDescription}
                  className="mb-4"
                />
                {isEmptyTimeSeries({ data: item.data }) ||
                queryResult.isLoading ? (
                  <NoDataOrLoading isLoading={queryResult.isLoading} />
                ) : (
                  <BaseTimeSeriesChart
                    agg={agg}
                    data={item.data}
                    showLegend={true}
                    connectNulls={true}
                    valueFormatter={item.formatter}
                  />
                )}
              </>
            ),
          };
        })}
      />
    </DashboardCard>
  );
};
