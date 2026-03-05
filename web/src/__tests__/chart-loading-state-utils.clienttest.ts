import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";
import { getChartLoadingStateProps } from "@/src/features/widgets/chart-library/chartLoadingStateUtils";

describe("getChartLoadingStateProps", () => {
  test("returns spinner-only loading props while query is pending", () => {
    expect(
      getChartLoadingStateProps({
        isPending: true,
        isError: false,
      }),
    ).toEqual({
      isLoading: true,
      showSpinner: true,
      showHintImmediately: false,
      hintText: undefined,
    });
  });

  test("returns immediate resource-limit hint when query failed", () => {
    expect(
      getChartLoadingStateProps({
        isPending: false,
        isError: true,
      }),
    ).toEqual({
      isLoading: true,
      showSpinner: false,
      showHintImmediately: true,
      hintText: RESOURCE_LIMIT_ERROR_MESSAGE,
    });
  });

  test("returns hidden state once query has no pending/error state", () => {
    expect(
      getChartLoadingStateProps({
        isPending: false,
        isError: false,
      }),
    ).toEqual({
      isLoading: false,
      showSpinner: false,
      showHintImmediately: false,
      hintText: undefined,
    });
  });
});
