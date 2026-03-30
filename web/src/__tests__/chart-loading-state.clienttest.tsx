import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

  test("keeps legacy pending state spinner-only without loading copy or hint", () => {
    const hintDelayMs = 1375;
    const { container } = render(
      <ChartLoadingState isLoading={true} hintDelayMs={hintDelayMs} />,
    );

    expect(
      screen.getByRole("status", { name: "Loading chart data" }),
    ).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("Loading widget")).not.toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(hintDelayMs);
    });

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("Loading widget")).not.toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();
  });

  test("keeps legacy pending state spinner-only when loading toggles off and on again", () => {
    const hintDelayMs = 825;
    const { rerender, container } = render(
      <ChartLoadingState isLoading={true} hintDelayMs={hintDelayMs} />,
    );

    act(() => {
      jest.advanceTimersByTime(hintDelayMs);
    });
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    rerender(<ChartLoadingState isLoading={false} hintDelayMs={hintDelayMs} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    rerender(<ChartLoadingState isLoading={true} hintDelayMs={hintDelayMs} />);
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(hintDelayMs);
    });
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();
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
    expect(screen.getByText("Query needs attention")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(container.querySelector(".space-y-3")).not.toBeInTheDocument();
    expect(
      container.querySelector('[aria-hidden="true"]'),
    ).not.toBeInTheDocument();
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

  test("renders a retry button for error states when a retry handler is provided", () => {
    const onRetry = jest.fn();

    render(
      <ChartLoadingState
        isLoading={true}
        showHintImmediately={true}
        showSpinner={false}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("shows only the spinner for the first second before swapping to the loading bar", () => {
    const { container } = render(
      <ChartLoadingState isLoading={true} progress={null} />,
    );

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(999);
    });

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  test("renders query progress details when progress is provided after the spinner phase", () => {
    const { container } = render(
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

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByText("Running query")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Reading 1.8B / ~2.9B rows")).toBeInTheDocument();
  });

  test("renders an indeterminate progress state while query progress is pending", () => {
    const progress = null;

    render(<ChartLoadingState isLoading={true} progress={progress} />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    const progressbar = screen.getByRole("progressbar", {
      name: "Query progress",
    });

    expect(progressbar).toBeInTheDocument();
    expect(progressbar).not.toHaveAttribute("aria-valuenow");
    expect(progressbar.firstElementChild).toBeNull();
    expect(screen.getByText("Running query")).toBeInTheDocument();
    expect(screen.getByText("Reading query progress...")).toBeInTheDocument();
  });

  test("renders the delayed warning below the loading bar section", () => {
    render(
      <ChartLoadingState isLoading={true} progress={null} hintDelayMs={1500} />,
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    const progressText = screen.getByText("Reading query progress...");
    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    const hint = screen.getByText(SLOW_QUERY_HINT_TEXT);
    expect(
      progressText.compareDocumentPosition(hint) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("prioritizes the loading bar in tight layouts once the spinner phase ends", () => {
    render(
      <ChartLoadingState
        isLoading={true}
        progress={null}
        layout="tight"
        hintDelayMs={1500}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Running query")).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.queryByText(SLOW_QUERY_HINT_TEXT)).not.toBeInTheDocument();
  });

  test("does not render skeleton preview chrome in the default layout", () => {
    const { container } = render(
      <ChartLoadingState isLoading={true} progress={null} />,
    );

    expect(container.querySelector(".rounded-xl")).not.toBeInTheDocument();
  });
});
