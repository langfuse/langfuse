import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";
import { type useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";

export function getWidgetChartQueryState({
  isPending,
  isError,
  error,
  usesBackendProgress,
  progress,
}: Pick<
  ReturnType<typeof useScheduledDashboardExecuteQuery>,
  "isPending" | "isError" | "error" | "progress"
> & {
  usesBackendProgress: boolean;
}) {
  const loadingProgress: Extract<
    Visualization,
    { type: "loading" }
  >["progress"] = (() => {
    if (!isPending || !usesBackendProgress) return { type: "spinner" };
    if (!progress) return { type: "indeterminate" };
    return {
      type: "determinate",
      fraction: progress.percent,
      read_rows: progress.read_rows,
      total_rows_to_read: progress.total_rows_to_read,
    };
  })();

  return {
    chartLoadingState: {
      isLoading: isPending || isError,
      showSpinner: isPending,
      showHintImmediately: isError,
      hintText: isError ? (error ?? RESOURCE_LIMIT_ERROR_MESSAGE) : undefined,
    },
    loadingProgress,
  };
}
