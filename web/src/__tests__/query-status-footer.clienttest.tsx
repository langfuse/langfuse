import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryStatusFooter } from "@/src/features/widgets/chart-library/QueryStatusFooter";

describe("QueryStatusFooter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("shows running text and row progress immediately", () => {
    render(
      <QueryStatusFooter
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

    expect(screen.getByText("Running query...")).toBeInTheDocument();
    expect(screen.getByText("Reading 1.8B / ~2.9B rows")).toBeInTheDocument();
    expect(
      screen.queryByText("Try reducing the time range or adding more filters."),
    ).not.toBeInTheDocument();
  });

  test("shows short recommendation copy for tight widgets after delay", () => {
    render(
      <QueryStatusFooter
        isLoading={true}
        layout="tight"
        hintDelayMs={900}
        progress={{
          read_rows: 1_736_400_000,
          total_rows_to_read: 2_924_600_000,
          elapsed_ns: 0,
          read_bytes: 0,
          percent: 0.5937,
        }}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(900);
    });

    expect(
      screen.getByText("Add filters or reduce range."),
    ).toBeInTheDocument();
  });

  test("shows an indeterminate progress placeholder before query progress arrives", () => {
    render(<QueryStatusFooter isLoading={true} />);

    const progressbar = screen.getByRole("progressbar", {
      name: "Query progress",
    });

    expect(progressbar).toBeInTheDocument();
    expect(progressbar).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Reading query progress...")).toBeInTheDocument();
  });
});
