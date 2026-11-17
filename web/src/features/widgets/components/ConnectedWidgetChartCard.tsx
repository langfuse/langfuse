import { type ComponentProps } from "react";
import { useWidgetChart, type WidgetContent } from "./InlineWidget";
import { WidgetChartCard } from "./WidgetChartCard";

export function ConnectedWidgetChartCard({
  title,
  description,
  tabs,
  actions,
  isDisplayLoading = false,
  ...query
}: Pick<
  ComponentProps<typeof WidgetChartCard>,
  "title" | "description" | "tabs" | "actions"
> &
  Pick<ComponentProps<typeof WidgetContent>, "layoutHint"> & {
    isDisplayLoading?: boolean;
  } & Parameters<typeof useWidgetChart>[0]) {
  const { chartProps, chartLoadingState, loadingProgress, onRetry } =
    useWidgetChart(query);
  const { isLoading, ...chart } = chartProps;
  const visualization = (() => {
    if (onRetry) {
      return {
        type: "error" as const,
        layout: query.layoutHint,
        message: chartLoadingState.hintText ?? "Unable to load chart data",
        onRetry,
      };
    }
    if (isLoading || isDisplayLoading) {
      return {
        type: "loading" as const,
        progress: loadingProgress,
        layout: query.layoutHint,
      };
    }
    return undefined;
  })();

  return (
    <WidgetChartCard
      {...chart}
      title={title}
      description={description}
      tabs={tabs}
      actions={actions}
      content={visualization}
    />
  );
}
