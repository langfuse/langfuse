import { useMemo } from "react";
import { type QueryType } from "@/src/features/query";
import {
  WidgetContent,
  WidgetHeader,
} from "@/src/features/widgets/components/InlineWidget";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EXPERIMENT_WIDGET_CONFIGS } from "../constants/experimentWidgetQueries";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

type ExperimentChartsProps = {
  projectId: string;
  experimentIds: string[];
  fromTimestamp: Date;
  toTimestamp: Date;
  isExternalLoading?: boolean;
};

/**
 * Renders experiment charts based on EXPERIMENT_WIDGET_CONFIGS.
 * Layout: 1 chart = full width, 2 = row, >2 = horizontal scroll.
 */
export function ExperimentCharts({
  projectId,
  experimentIds,
  fromTimestamp,
  toTimestamp,
  isExternalLoading = false,
}: ExperimentChartsProps) {
  const isEnabled = experimentIds.length > 0;
  const chartCount = EXPERIMENT_WIDGET_CONFIGS.length;

  const queries: QueryType[] = useMemo(
    () =>
      EXPERIMENT_WIDGET_CONFIGS.map((config) => ({
        view: config.view,
        dimensions: config.dimensions,
        metrics: config.metrics.map((m) => ({
          measure: m.measure,
          aggregation: m.aggregation,
        })),
        timeDimension: config.timeDimension,
        entityDimension: config.entityDimension,
        orderBy: config.orderBy,
        filters: [
          {
            column: "experimentId",
            operator: "any of" as const,
            value: experimentIds,
            type: "stringOptions" as const,
          },
        ],
        fromTimestamp: fromTimestamp.toISOString(),
        toTimestamp: toTimestamp.toISOString(),
      })),
    [experimentIds, fromTimestamp, toTimestamp],
  );

  const showSkeletons = isExternalLoading;

  if (!isExternalLoading && !isEnabled)
    return (
      <NoDataOrLoading
        isLoading={false}
        description="Adjust filters to see results."
      />
    );

  // 1 chart: full width
  if (chartCount === 1) {
    if (showSkeletons) {
      return <Skeleton className="h-64 w-full" />;
    }
    return (
      <div className="flex h-64 w-full flex-col">
        <WidgetHeader
          title={EXPERIMENT_WIDGET_CONFIGS[0].name}
          description={EXPERIMENT_WIDGET_CONFIGS[0].description}
        />
        <WidgetContent
          projectId={projectId}
          query={queries[0]}
          version={EXPERIMENT_WIDGET_CONFIGS[0].version}
          chartType={EXPERIMENT_WIDGET_CONFIGS[0].chartType}
          chartConfig={EXPERIMENT_WIDGET_CONFIGS[0].chartConfig}
          metrics={EXPERIMENT_WIDGET_CONFIGS[0].metrics}
          dimensions={EXPERIMENT_WIDGET_CONFIGS[0].dimensions}
          view={EXPERIMENT_WIDGET_CONFIGS[0].view}
          schedulerId={EXPERIMENT_WIDGET_CONFIGS[0].schedulerId}
          isExternalLoading={isExternalLoading || !isEnabled}
        />
      </div>
    );
  }

  // 2 charts: side by side
  if (chartCount === 2) {
    if (showSkeletons) {
      return (
        <div className="flex h-64 gap-4">
          <Skeleton className="h-full flex-1" />
          <Skeleton className="h-full flex-1" />
        </div>
      );
    }
    return (
      <div className="flex h-64 gap-4">
        {EXPERIMENT_WIDGET_CONFIGS.map((config, i) => (
          <div key={config.schedulerId} className="flex flex-1 flex-col">
            <WidgetHeader
              title={config.name}
              description={config.description}
            />
            <WidgetContent
              projectId={projectId}
              query={queries[i]}
              version={config.version}
              chartType={config.chartType}
              chartConfig={config.chartConfig}
              metrics={config.metrics}
              dimensions={config.dimensions}
              view={config.view}
              schedulerId={config.schedulerId}
              isExternalLoading={isExternalLoading || !isEnabled}
            />
          </div>
        ))}
      </div>
    );
  }

  // >2 charts: horizontal scroll, each ~half width
  if (showSkeletons) {
    return (
      <div className="flex h-64 gap-4 overflow-x-auto">
        {EXPERIMENT_WIDGET_CONFIGS.map((config) => (
          <Skeleton
            key={config.schedulerId}
            className="h-full w-[48%] shrink-0"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex h-64 gap-4 overflow-x-auto">
      {EXPERIMENT_WIDGET_CONFIGS.map((config, i) => (
        <div
          key={config.schedulerId}
          className="flex w-[48%] shrink-0 flex-col"
        >
          <WidgetHeader title={config.name} description={config.description} />
          <WidgetContent
            projectId={projectId}
            query={queries[i]}
            version={config.version}
            chartType={config.chartType}
            chartConfig={config.chartConfig}
            metrics={config.metrics}
            dimensions={config.dimensions}
            view={config.view}
            schedulerId={config.schedulerId}
            isExternalLoading={isExternalLoading || !isEnabled}
          />
        </div>
      ))}
    </div>
  );
}
