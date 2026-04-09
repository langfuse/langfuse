import { render, screen } from "@testing-library/react";
import { MetricStrip } from "./MetricStrip";

describe("MetricStrip", () => {
  const metrics = [
    {
      id: "metric-1",
      label: "A very long metric label that should stay on a single line",
      value: "128",
    },
  ];

  it("renders metric titles with truncate", () => {
    render(<MetricStrip metrics={metrics} />);

    const title = screen.getByText(metrics[0].label);
    expect(title.className).toContain("truncate");
  });

  it("renders metric values with tabular-nums", () => {
    render(<MetricStrip metrics={metrics} />);

    const value = screen.getByText(metrics[0].value);
    expect(value.className).toContain("tabular-nums");
  });
});
