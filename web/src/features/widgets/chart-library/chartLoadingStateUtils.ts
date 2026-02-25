import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";

type ChartQueryState = {
  isPending: boolean;
  isError: boolean;
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
}: ChartQueryState): ChartLoadingProps {
  return {
    isLoading: isPending || isError,
    showSpinner: isPending,
    showHintImmediately: isError,
    hintText: isError ? RESOURCE_LIMIT_ERROR_MESSAGE : undefined,
  };
}
