import { act, renderHook } from "@testing-library/react";
import { usePreparedWidgetChart } from "./usePreparedWidgetChart";

describe("usePreparedWidgetChart", () => {
  const data = [
    { time_dimension: "2026-11-01T00:00:00Z", dimension: "First", metric: 2 },
    { time_dimension: "2026-11-02T00:00:00Z", dimension: "Second", metric: 3 },
  ];

  test("defers large chart preparation until confirmed and remembers consent", () => {
    const largeData = Array.from({ length: 2001 }, () => data[0]!);
    const { result, rerender } = renderHook(
      ({ points }) =>
        usePreparedWidgetChart({
          chartType: "HORIZONTAL_BAR",
          data: points,
          active: true,
        }),
      { initialProps: { points: largeData.slice(0, 2000) } },
    );
    expect(result.current.confirmation).toBeUndefined();
    rerender({ points: largeData });
    expect(result.current.confirmation).toMatchObject({
      type: "confirmation",
      title: "Large Dataset Warning",
      actionLabel: "I understand, proceed to render the chart",
      onConfirm: expect.any(Function),
    });
    expect(result.current.visualization).toMatchObject({ data: [] });
    act(() => result.current.confirmation?.onConfirm());
    expect(result.current.confirmation).toBeUndefined();
    expect(result.current.visualization).toMatchObject({
      data: Array.from({ length: 100 }, () => ({ label: "First", value: 2 })),
    });
    rerender({ points: [...largeData, ...largeData] });
    expect(result.current.confirmation).toBeUndefined();
  });

  test("allows overriding the warning without activating an inactive chart", () => {
    const largeData = Array.from({ length: 2001 }, () => data[0]!);
    const { result, rerender } = renderHook(
      ({ active }) =>
        usePreparedWidgetChart({
          chartType: "HORIZONTAL_BAR",
          data: largeData,
          active,
          overrideWarning: true,
        }),
      { initialProps: { active: false } },
    );
    expect(result.current.confirmation).toBeUndefined();
    expect(result.current.visualization).toMatchObject({ data: [] });
    rerender({ active: true });
    expect(result.current.visualization).toMatchObject({
      data: Array.from({ length: 100 }, () => ({ label: "First", value: 2 })),
    });
  });

  test("aggregates number values and preserves a custom formatter", () => {
    const metricFormatter = () => ({ main: "custom" });
    const { result } = renderHook(() =>
      usePreparedWidgetChart({
        chartType: "NUMBER",
        data,
        active: true,
        metricFormatter,
      }),
    );
    expect(result.current.visualization).toMatchObject({
      type: "number",
      value: 5,
      valueFormatter: metricFormatter,
    });
  });

  test("limits ranked rows and skips preparation while inactive", () => {
    const { result, rerender } = renderHook(
      ({ active }) =>
        usePreparedWidgetChart({
          chartType: "HORIZONTAL_BAR",
          data,
          active,
          rowLimit: 1,
        }),
      { initialProps: { active: true } },
    );
    expect(result.current.visualization).toMatchObject({
      type: "horizontal-bar",
      data: [{ label: "First", value: 2 }],
    });
    rerender({ active: false });
    expect(result.current.visualization).toMatchObject({
      type: "horizontal-bar",
      data: [],
    });
  });
});
