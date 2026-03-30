import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";
import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";

type ChartQueryState = {
  isPending: boolean;
  isError: boolean;
  errorMessage?: string | null;
};

type ChartLoadingProps = {
  isLoading: boolean;
  showSpinner: boolean;
  showHintImmediately: boolean;
  hintText?: string;
};

export function getChartLoadingStateProps({
  isPending,
  isError,
  errorMessage,
}: ChartQueryState): ChartLoadingProps {
  return {
    isLoading: isPending || isError,
    showSpinner: isPending,
    showHintImmediately: isError,
    hintText: isError
      ? (errorMessage ?? RESOURCE_LIMIT_ERROR_MESSAGE)
      : undefined,
  };
}

export function getChartLoadingProgress({
  isPending,
  progress,
  useBackendProgress,
}: {
  isPending: boolean;
  progress: QueryProgress | null;
  useBackendProgress: boolean;
}): QueryProgress | null | undefined {
  if (!isPending || !useBackendProgress) {
    return undefined;
  }

  return progress ?? null;
}
