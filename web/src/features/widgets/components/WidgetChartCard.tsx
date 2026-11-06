import { type ComponentProps } from "react";
import { usePreparedWidgetChart } from "./usePreparedWidgetChart";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { DataCard } from "@/src/components/design-system/DataCard/DataCard";
import { type ChartProps } from "../chart-library/chart-props";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type OrderByState } from "@langfuse/shared";

const EMPTY_DATA: ChartProps["data"] = [];

type WidgetChartCardProps = Pick<
  ComponentProps<typeof DataCard>,
  "title" | "description" | "badge" | "controls" | "tabs" | "actions"
> &
  Pick<
    ChartProps,
    | "config"
    | "legendPosition"
    | "legendSummary"
    | "legendInteraction"
    | "maxVisibleSeries"
    | "syncId"
    | "sync"
    | "metricFormatter"
    | "thresholds"
    | "missingValue"
    | "hideXAxisLabels"
    | "compactYAxis"
    | "colorBarsByCategory"
    | "zeroBaseline"
  > & {
    chartConfig?: Parameters<typeof usePreparedWidgetChart>[0]["chartConfig"];
    sortState?: OrderByState | null;
    onSortChange?: (sortState: OrderByState | null) => void;
    rowLimit?: number;
    overrideWarning?: boolean;
    label?: string;
    unit?: string;
    metric?: { value: string | number; description?: string };
  } & (
    | {
        chartType: DashboardWidgetChartType;
        data: ChartProps["data"];
        content?: Extract<
          ComponentProps<typeof DataCard>["content"],
          { type: "loading" | "empty" | "error" | "confirmation" }
        >;
      }
    | {
        chartType?: never;
        data?: never;
        content: Extract<
          ComponentProps<typeof DataCard>["content"],
          { type: "loading" | "empty" | "error" | "confirmation" }
        >;
      }
  );

export function WidgetChartCard(props: WidgetChartCardProps) {
  const {
    chartType,
    title,
    description,
    badge,
    controls,
    tabs,
    actions,
    content,
    metric,
    data = EMPTY_DATA,
    label,
    unit,
    config,
    chartConfig,
    rowLimit = 100,
    overrideWarning = false,
    ...chart
  } = props;
  const displayContent =
    content ??
    (isChartDataEmpty(data) ? { type: "empty" as const } : undefined);
  const prepared = usePreparedWidgetChart({
    ...chart,
    chartType,
    data,
    config,
    chartConfig,
    label,
    unit,
    rowLimit,
    overrideWarning,
    active: !displayContent,
  });
  const { confirmation } = prepared;
  const card = {
    title,
    description,
    badge,
    controls,
    tabs,
    actions,
    metric,
  };
  if (props.chartType === undefined)
    return <DataCard {...card} content={props.content} />;
  if (displayContent) {
    if (displayContent.type === "loading") {
      const skeleton = (
        {
          NUMBER: "number",
          PIVOT_TABLE: "table",
          HORIZONTAL_BAR: "table",
          LINE_TIME_SERIES: "chart",
          AREA_TIME_SERIES: "chart",
          BAR_TIME_SERIES: "chart",
          VERTICAL_BAR: "chart",
          PIE: "pie",
          HISTOGRAM: "chart",
        } as const satisfies Record<
          DashboardWidgetChartType,
          NonNullable<
            Extract<
              ComponentProps<typeof DataCard>["content"],
              { type: "loading" }
            >["skeleton"]
          >
        >
      )[props.chartType];
      return (
        <DataCard
          {...card}
          content={{
            ...displayContent,
            compactYAxis: chart.compactYAxis,
            hideXAxisLabels: chart.hideXAxisLabels,
            skeleton: displayContent.skeleton ?? skeleton,
          }}
        />
      );
    }
    return <DataCard {...card} content={displayContent} />;
  }
  if (confirmation) {
    return <DataCard {...card} content={confirmation} />;
  }
  if (
    (prepared.visualization.type === "histogram" &&
      !prepared.visualization.data.length) ||
    (prepared.visualization.type === "table" &&
      !prepared.visualization.rows.length)
  ) {
    return <DataCard {...card} content={{ type: "empty" }} />;
  }
  return <DataCard {...card} {...prepared} content={prepared.visualization} />;
}
