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

  test("renders spinner immediately, waits 1 second before showing progress, and 3 seconds before showing the hint", () => {
    render(<ChartLoadingState isLoading={true} />);

    expect(
      screen.getByRole("status", { name: "Loading chart data" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Reading query progress...")).toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText(SLOW_QUERY_HINT_TEXT)).toBeInTheDocument();
  });

  test("resets delayed progress and hint when loading toggles off and on again", () => {
    const { rerender } = render(<ChartLoadingState isLoading={true} />);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText(SLOW_QUERY_HINT_TEXT)).toBeInTheDocument();

    rerender(<ChartLoadingState isLoading={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    rerender(<ChartLoadingState isLoading={true} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
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
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
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

  test("renders query progress details after the progress delay when progress is provided", () => {
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

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Running query...")).toBeInTheDocument();
    expect(screen.getByText("Reading 1.8B / ~2.9B rows")).toBeInTheDocument();
  });

  test("supports tight layout with the same delayed loader behavior", () => {
    render(<ChartLoadingState isLoading={true} layout="tight" />);

    expect(
      screen.getByRole("status", { name: "Loading chart data" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
