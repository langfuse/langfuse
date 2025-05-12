import { cleanup, renderHook, act } from "@testing-library/react";
import { useChartSelectState } from "./useChartSelectState";
import { dashboardChartDefinitions } from "../constants/chartDefinitions";

// Each test checks state and storage functionality for useChartSelectState behaviour
describe("useChartSelectState hook", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(cleanup);

  test("should initialise with all charts visible by default", () => {
    const { result } = renderHook(() => useChartSelectState("test-project"));

    expect(result.current.selectedDashboardCharts).toEqual(
      dashboardChartDefinitions.map((d) => d.key),
    );

    expect(
      JSON.parse(
        sessionStorage.getItem("selectedDashboardChartKeys-test-project") ||
          "[]",
      ),
    ).toEqual(dashboardChartDefinitions.map((d) => d.key));
  });

  test("should persist chart selections to session storage", () => {
    const { result } = renderHook(() => useChartSelectState("test-project"));

    act(() => {
      result.current.setSelectedDashboardCharts([
        dashboardChartDefinitions[0].key,
      ]);
    });

    expect(
      JSON.parse(
        sessionStorage.getItem("selectedDashboardChartKeys-test-project") ||
          "[]",
      ),
    ).toEqual([dashboardChartDefinitions[0].key]);
  });

  test("should prevent empty selection state", () => {
    const { result } = renderHook(() => useChartSelectState("test-project"));

    act(() => {
      result.current.setSelectedDashboardCharts([]);
    });

    expect(result.current.selectedDashboardCharts.length).toBeGreaterThan(0);

    expect(
      JSON.parse(
        sessionStorage.getItem("selectedDashboardChartKeys-test-project") ||
          "[]",
      ).length,
    ).toBeGreaterThan(0);
  });

  test("should remove invalid chart keys from selection", () => {
    sessionStorage.setItem(
      "selectedDashboardChartKeys-test-project",
      JSON.stringify([
        ...dashboardChartDefinitions.map((d) => d.key),
        "invalid-key",
      ]),
    );

    const { result } = renderHook(() => useChartSelectState("test-project"));

    expect(result.current.selectedDashboardCharts).toEqual(
      dashboardChartDefinitions.map((d) => d.key),
    );

    expect(
      JSON.parse(
        sessionStorage.getItem("selectedDashboardChartKeys-test-project") ||
          "[]",
      ),
    ).toEqual(dashboardChartDefinitions.map((d) => d.key));
  });

  test("should keep a chart visible when attempting to clear all", () => {
    const { result } = renderHook(() => useChartSelectState("test-project"));

    const testCharts = [
      dashboardChartDefinitions[0].key,
      dashboardChartDefinitions[1].key,
    ];

    act(() => {
      result.current.setSelectedDashboardCharts(testCharts);
    });

    act(() => {
      result.current.setSelectedDashboardCharts([]);
    });

    // Should keep one of the previously selected charts
    const resultingChart = result.current.selectedDashboardCharts[0];
    expect(testCharts).toContain(resultingChart);
    expect(result.current.selectedDashboardCharts.length).toBe(1);

    expect(
      JSON.parse(
        sessionStorage.getItem("selectedDashboardChartKeys-test-project") ||
          "[]",
      ),
    ).toEqual([resultingChart]);
  });
});
