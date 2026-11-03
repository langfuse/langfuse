import { act, renderHook } from "@testing-library/react";
import { useExperimentCharts } from "./useExperimentCharts";
import { type MetricOption } from "../types/charts";

const cost: MetricOption = {
  id: "base:cost",
  label: "Cost ($)",
  group: "Base Metrics",
};
const latency: MetricOption = {
  id: "base:latency",
  label: "Latency (ms)",
  group: "Base Metrics",
};
const accuracy: MetricOption = {
  id: "obs-score-numeric:accuracy",
  label: "accuracy",
  group: "Scores",
  level: "obs",
  valueKind: "numeric",
};
const quality: MetricOption = {
  ...accuracy,
  id: "obs-score-numeric:quality",
  label: "quality",
};
const options = [cost, latency, accuracy, quality];

beforeEach(() => localStorage.clear());

it("keeps an explicit metric and chart type across filters and remounts", () => {
  const { result, rerender, unmount } = renderHook(
    ({ availableMetricOptions }) =>
      useExperimentCharts({ projectId: "p1", availableMetricOptions }),
    { initialProps: { availableMetricOptions: options } },
  );
  act(() =>
    result.current.updateChart("initial", {
      metricId: accuracy.id,
      chartType: "bar",
    }),
  );
  rerender({ availableMetricOptions: [cost, latency] });
  expect(result.current.charts[0]).toMatchObject({
    metricId: accuracy.id,
    chartType: "bar",
  });
  unmount();
  const restored = renderHook(() =>
    useExperimentCharts({ projectId: "p1", availableMetricOptions: options }),
  );
  expect(restored.result.current.charts[0]).toMatchObject({
    metricId: accuracy.id,
    chartType: "bar",
  });
  const otherProject = renderHook(() =>
    useExperimentCharts({ projectId: "p2", availableMetricOptions: [cost] }),
  );
  expect(otherProject.result.current.charts[0]).toMatchObject({
    metricId: cost.id,
    chartType: "line",
  });
});
