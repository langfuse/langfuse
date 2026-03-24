import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SLOW_QUERY_HINT_TEXT } from "@langfuse/shared";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";

describe("ChartLoadingState", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders spinner immediately and delayed hint after configured delay", () => {
    const hintDelayMs = 1375;

    render(<ChartLoadingState isLoading={true} hintDelayMs={hintDelayMs} />);

    expect(
      screen.getByRole("status", { name: "Loading chart data" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(hintDelayMs - 1);
    });
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText(SLOW_QUERY_HINT_TEXT)).toBeInTheDocument();
  });

  test("resets delayed hint when loading toggles off and on again", () => {
    const hintDelayMs = 825;

    const { rerender } = render(
      <ChartLoadingState isLoading={true} hintDelayMs={hintDelayMs} />,
    );

    act(() => {
      jest.advanceTimersByTime(hintDelayMs);
    });
    expect(screen.getByText(SLOW_QUERY_HINT_TEXT)).toBeInTheDocument();

    rerender(<ChartLoadingState isLoading={false} hintDelayMs={hintDelayMs} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    rerender(<ChartLoadingState isLoading={true} hintDelayMs={hintDelayMs} />);
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(hintDelayMs);
    });
    expect(screen.getByText(SLOW_QUERY_HINT_TEXT)).toBeInTheDocument();
  });

  test("shows hint immediately without spinner for overload state", () => {
    const { container } = render(
      <ChartLoadingState
        isLoading={true}
        showSpinner={false}
        showHintImmediately={true}
      />,
    );

    expect(screen.getByText(SLOW_QUERY_HINT_TEXT)).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  test("renders a provided hint text for error states", () => {
    const customHint = "Custom resource limit hint";

    render(
      <ChartLoadingState
        isLoading={true}
        showHintImmediately={true}
        showSpinner={false}
        hintText={customHint}
      />,
    );

    expect(screen.getByText(customHint)).toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();
  });

  test("renders query progress details when progress is provided", () => {
    render(
      <ChartLoadingState
        isLoading={true}
        progress={{
          read_rows: 1_779_300_000,
          total_rows_to_read: 2_924_500_000,
          elapsed_ns: 0,
          read_bytes: 0,
          percent: 0.6084,
        }}
      />,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Reading 1.8B / ~2.9B rows")).toBeInTheDocument();
  });

  test("supports tight layout without rendering the default preview chrome", () => {
    const { container } = render(
      <ChartLoadingState isLoading={true} layout="tight" />,
    );

    expect(
      screen.getByRole("status", { name: "Loading chart data" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".space-y-3")).not.toBeInTheDocument();
  });
});
