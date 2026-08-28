import React, { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { useChartTickBudget } from "@/src/features/widgets/chart-library/useChartTickBudget";
import {
  prepareCategoryBars,
  type CategoryBarLegendItem,
} from "@/src/features/widgets/chart-library/prepareCategoryBars";
import { cn } from "@/src/utils/tailwind";

/**
 * Names every bar, in bar order, in ONE row that never wraps. This legend is
 * built for a table strip's 63px band, where the wrapping/scrolling legend the
 * time-series charts use would crowd out the plot it is explaining. Names share
 * the row and ellipsize (full name in `title`), which still identifies runs
 * whose names differ early — as model/prompt variants do.
 */
function CategoryBarLegend({ items }: { items: CategoryBarLegendItem[] }) {
  return (
    <div className="mt-1 flex h-4 min-w-0 shrink-0 items-center gap-x-3 overflow-hidden">
      {items.map((item) => (
        <div key={item.category} className="flex min-w-0 items-center gap-1.5">
          <div
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span
            className="text-muted-foreground truncate text-xs leading-4"
            title={item.category}
          >
            {item.category}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * VerticalBarChart component
 * @param data - Data to be displayed. Expects an array of objects with dimension and metric properties.
 * @param config - Configuration object for the chart. Can include theme settings for light and dark modes.
 * @param accessibilityLayer - Boolean to enable or disable the accessibility layer. Default is true.
 */
export const VerticalBarChart: React.FC<ChartProps> = ({
  data,
  config = {
    metric: {
      theme: {
        light: "hsl(var(--chart-1))",
        dark: "hsl(var(--chart-1))",
      },
    },
  },
  accessibilityLayer = true,
  metricFormatter = (value, options) => formatMetric(value, options),
  subtleFill = false,
  hideXAxisLabels = false,
  colorBarsByCategory = false,
  zeroBaseline = false,
}) => {
  const { ref: containerRef, maxYTicks } = useChartTickBudget();

  const categoryBars = useMemo(
    () => (colorBarsByCategory ? prepareCategoryBars(data) : null),
    [colorBarsByCategory, data],
  );
  const rows = categoryBars?.rows ?? data;
  const legend = categoryBars?.legend ?? [];

  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <ChartContainer
        ref={containerRef}
        config={config}
        className="min-h-0 flex-1 [&_.recharts-bar-rectangle:hover]:opacity-30 dark:[&_.recharts-bar-rectangle:hover]:opacity-100 dark:[&_.recharts-bar-rectangle:hover]:brightness-[3]"
      >
        <BarChart accessibilityLayer={accessibilityLayer} data={rows}>
          <XAxis
            type="category"
            dataKey="dimension"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            niceTicks="auto"
            // Same treatment prepareTimeAxis gives a hidden categorical axis:
            // every tick drawn, label-less, on a slim axis. The category stays
            // in the legend and the tooltip. (LFE-15711)
            {...(hideXAxisLabels
              ? { interval: 0, tickFormatter: () => "", height: 8 }
              : {})}
          />
          <YAxis
            type="number"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            niceTicks="auto"
            // `min(0, dataMin)` rather than a flat 0 so a negative series (a
            // delta) still fits, and the max keeps `"auto"`, which is what lets
            // niceTicks round the top of the scale. (LFE-15711)
            {...(zeroBaseline
              ? {
                  domain: [
                    (dataMin: number) => Math.min(0, dataMin),
                    "auto" as const,
                  ] as const,
                }
              : {})}
            // Ask for only as many ticks as the measured height fits, so
            // recharts never has to drop colliding labels — and so the zero
            // tick, the one that says where a bar is measured from, survives in
            // a short band.
            tickCount={maxYTicks}
            tickFormatter={(value) => formatValue(Number(value))}
          />
          <Bar
            dataKey="metric"
            radius={[4, 4, 0, 0]}
            // A CSS `fill` beats the per-row `fill` attribute the preparer set,
            // so the single-colour class only applies when there are no
            // per-category colours.
            className={cn(legend.length === 0 && "fill-(--color-metric)")}
            fillOpacity={subtleFill ? 0.3 : 1}
            isAnimationActive={false}
          />
          <ChartTooltip
            cursor={false}
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            content={({ active, payload, label }) => (
              <ChartTooltipContent
                active={active}
                payload={payload}
                label={label}
                valueFormatter={(v) => formatValue(Number(v))}
              />
            )}
          />
        </BarChart>
      </ChartContainer>
      {legend.length > 0 ? (
        <CategoryBarLegend items={legend} />
      ) : (
        // No legend and no axis labels: say where identity lives rather than
        // leaving anonymous bars (manifesto principle 8).
        colorBarsByCategory &&
        hideXAxisLabels && (
          <div className="text-muted-foreground mt-1 h-4 shrink-0 text-right text-[11px] leading-4">
            Hover a bar to name it
          </div>
        )
      )}
    </div>
  );
};
