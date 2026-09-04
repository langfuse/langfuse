import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentChartsGrid } from "./ExperimentChartsGrid";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  updateChart: vi.fn(),
  charts: ["base:cost"],
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => h.capture,
}));

vi.mock(
  "@/src/features/experiments/hooks/useExperimentChartsGridSelection",
  () => ({
    useExperimentChartsGridSelection: () => ({
      charts: h.charts,
      updateChart: h.updateChart,
      addChart: vi.fn(),
      removeChart: vi.fn(),
      canAddChart: false,
      canDeleteChart: false,
      availableMetricOptions: [
        { id: "base:cost", label: "Cost", group: "base" },
        {
          id: "obs-score-numeric:helpfulness",
          label: "helpfulness",
          group: "score",
        },
      ],
      isLoading: false,
    }),
  }),
);

vi.mock("@/src/features/experiments/components/ExperimentChartSlot", () => ({
  ExperimentChartSlot: ({
    selectedMetricId,
    onMetricChange,
  }: {
    selectedMetricId: string;
    onMetricChange: (id: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onMetricChange("obs-score-numeric:helpfulness")}
    >
      change-{selectedMetricId}
    </button>
  ),
}));

describe("ExperimentChartsGrid analytics", () => {
  beforeEach(() => {
    h.capture.mockClear();
    h.updateChart.mockClear();
    h.charts = ["base:cost"];
  });

  it("captures chart_metric_changed with metricGroup, not the score name", () => {
    render(
      <ExperimentChartsGrid
        projectId="p1"
        experiments={[{ id: "exp-a", name: "My Experiment A" }]}
        fromTimestamp={new Date("2026-01-01")}
        toTimestamp={new Date("2026-01-02")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "change-base:cost" }));

    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith("experiment:chart_metric_changed", {
      isV4: true,
      tableName: "experiments",
      metricGroup: "score",
      chartIndex: 0,
      slotCount: 1,
    });
    expect(JSON.stringify(h.capture.mock.calls[0][1])).not.toMatch(
      /helpfulness|My Experiment/,
    );
    expect(h.updateChart).toHaveBeenCalledWith(
      0,
      "obs-score-numeric:helpfulness",
    );
  });

  it("does not capture when the metric is unchanged", () => {
    h.charts = ["obs-score-numeric:helpfulness"];
    render(
      <ExperimentChartsGrid
        projectId="p1"
        experiments={[{ id: "exp-a", name: "My Experiment A" }]}
        fromTimestamp={new Date("2026-01-01")}
        toTimestamp={new Date("2026-01-02")}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "change-obs-score-numeric:helpfulness",
      }),
    );

    expect(h.capture).not.toHaveBeenCalled();
    expect(h.updateChart).not.toHaveBeenCalled();
  });
});
