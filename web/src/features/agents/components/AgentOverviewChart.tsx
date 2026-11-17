import { type ComponentProps } from "react";
import { LineChart } from "@/src/components/design-system/charts/LineChart/LineChart";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { type AgentOverviewChart as PreparedChart } from "../lib/agentOverview";

export function AgentOverviewChart({
  chart,
  sync,
}: {
  chart: PreparedChart;
  sync: NonNullable<ComponentProps<typeof LineChart>["sync"]>;
}) {
  const hasValues = chart.data.some((point) =>
    Object.values(point.values).some((value) => value !== null),
  );
  return (
    <section className="ph-no-capture min-w-0 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CustomTooltip
            content={
              <p className="ph-no-capture max-w-xs">{chart.description}</p>
            }
          >
            {({ getTriggerProps }) => (
              <h3
                {...getTriggerProps()}
                tabIndex={0}
                className="text-sm font-bold"
              >
                {chart.title}
              </h3>
            )}
          </CustomTooltip>
          <p className="text-lg font-bold tabular-nums">{chart.value}</p>
        </div>
        {chart.comparison && (
          <p className="text-muted-foreground text-xs">{chart.comparison}</p>
        )}
      </div>
      <div className="mt-3 h-52 min-w-0">
        {hasValues ? (
          <LineChart
            data={chart.data}
            series={chart.series}
            valueFormatter={chart.formatValue}
            xAxis={{ type: "time" }}
            yAxis={chart.yAxis}
            ariaLabel={chart.title}
            connectNulls={false}
            sync={sync}
            legend={{
              visibility: "visible",
              interaction: "highlight",
              summary: "none",
            }}
          />
        ) : (
          <p className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
            {chart.emptyMessage}
          </p>
        )}
      </div>
    </section>
  );
}
