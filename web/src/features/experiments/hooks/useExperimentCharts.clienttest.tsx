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

it("keeps the default automatic, adds unused metrics, and retains at least one chart", () => {
  const { result, rerender } = renderHook(
    ({ availableMetricOptions }) =>
      useExperimentCharts({ projectId: "p1", availableMetricOptions }),
    { initialProps: { availableMetricOptions: [cost] } },
  );
  expect(result.current.charts[0].metricId).toBe(cost.id);
  rerender({ availableMetricOptions: options });
  expect(result.current.charts[0].metricId).toBe(accuracy.id);
  for (let i = 0; i < 4; i++) act(() => result.current.addChart());
  expect(result.current.charts).toHaveLength(4);
  expect(
    new Set(result.current.charts.map((chart) => chart.metricId)).size,
  ).toBe(4);
  expect(result.current.canAdd).toBe(false);
  const ids = result.current.charts.map((chart) => chart.id);
  for (const id of ids) act(() => result.current.removeChart(id));
  expect(result.current.charts).toHaveLength(1);
});

it("recovers from malformed stored configuration", () => {
  localStorage.setItem("experiment-charts-v1-p1", JSON.stringify([null]));
  const { result } = renderHook(() =>
    useExperimentCharts({ projectId: "p1", availableMetricOptions: options }),
  );
  expect(result.current.charts).toEqual([
    { id: "initial", metricId: accuracy.id, chartType: "line" },
  ]);
});
