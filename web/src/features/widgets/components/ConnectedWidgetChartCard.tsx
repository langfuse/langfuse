import { type ComponentProps } from "react";
import { useWidgetChart, type WidgetContent } from "./InlineWidget";
import { WidgetChartCard } from "./WidgetChartCard";

export function ConnectedWidgetChartCard({
  title,
  description,
  filter,
  tabs,
  actions,
  isDisplayLoading = false,
  displayError,
  ...query
}: Pick<
  ComponentProps<typeof WidgetChartCard>,
  "title" | "description" | "filter" | "tabs" | "actions"
> &
  Pick<ComponentProps<typeof WidgetContent>, "layoutHint"> & {
    isDisplayLoading?: boolean;
    /** An error from what the chart depends on, shown like a failed query. */
    displayError?: { message: string; onRetry: () => void };
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
    if (displayError) {
      return {
        type: "error" as const,
        layout: query.layoutHint,
        ...displayError,
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
      filter={filter}
      tabs={tabs}
      actions={actions}
      content={visualization}
    />
  );
}
