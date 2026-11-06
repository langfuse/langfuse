import { type ComponentProps } from "react";
import { useWidgetChart, type WidgetContent } from "./InlineWidget";
import { WidgetChartCard } from "./WidgetChartCard";

export function ConnectedWidgetChartCard({
  title,
  description,
  ...query
}: Pick<ComponentProps<typeof WidgetChartCard>, "title" | "description"> &
  Pick<ComponentProps<typeof WidgetContent>, "layoutHint"> &
  Parameters<typeof useWidgetChart>[0]) {
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
    if (isLoading) {
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
      content={visualization}
    />
  );
}
