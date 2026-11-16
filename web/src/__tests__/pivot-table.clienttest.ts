import { act, renderHook } from "@testing-library/react";
import { usePivotTable } from "@/src/features/widgets/chart-library/usePivotTable";

describe("usePivotTable", () => {
  it("returns empty rows to its parent", () => {
    const { result } = renderHook(() => usePivotTable({ data: [] }));
    expect(result.current.visualization.rows).toEqual([]);
  });

  it("preserves array and boolean dimension groups", () => {
    const data = [
      {
        dimension: undefined,
        time_dimension: undefined,
        metric: 12,
        tags: ["a", "b"],
        enabled: true,
      },
      {
        dimension: undefined,
        time_dimension: undefined,
        metric: 8,
        tags: ["c"],
        enabled: false,
      },
    ];
    const { result } = renderHook(() =>
      usePivotTable({
        data,
        config: { dimensions: ["tags", "enabled"], metrics: ["metric"] },
      }),
    );
    const labels = result.current.visualization.rows.map(
      (row) => row.cells[0]?.value,
    );
    expect(labels).toEqual(
      expect.arrayContaining(["a, b - true", "c - false"]),
    );
    expect(result.current.visualization.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ emphasis: "subtotal" }),
        expect.objectContaining({ emphasis: "total" }),
      ]),
    );
  });

  it("sums nested numeric metrics", () => {
    const { result } = renderHook(() =>
      usePivotTable({
        data: [
          {
            dimension: "test",
            time_dimension: undefined,
            metric: [
              [10, 20],
              [30, 40],
            ],
          },
        ],
      }),
    );
    expect(result.current.visualization.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cells: expect.arrayContaining([
            expect.objectContaining({ value: "100" }),
          ]),
        }),
      ]),
    );
  });

  it("retains controlled sorting", () => {
    const onSortChange = vi.fn();
    const { result } = renderHook(() =>
      usePivotTable({
        data: [],
        sortState: { column: "metric", order: "ASC" },
        onSortChange,
      }),
    );
    const column = result.current.visualization.columns[1];
    if (!column || !("onSort" in column))
      throw new Error("Missing sortable column");
    expect(column.sort).toBe("asc");
    act(() => column.onSort?.());
    expect(onSortChange).toHaveBeenCalledWith(null);
  });
});
