import { render, renderHook, screen, fireEvent } from "@testing-library/react";
import { usePivotTable } from "@/src/features/widgets/chart-library/usePivotTable";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";

const data = [{ time_dimension: "2024-01-01", dimension: "test", metric: 100 }];

function PivotTable(props: Parameters<typeof usePivotTable>[0]) {
  const { visualization } = usePivotTable(props);
  return <VisualizationFrame content={visualization} />;
}

describe("usePivotTable", () => {
  it("prepares data without rendering a shell", () => {
    render(<PivotTable data={data} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Dimension" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });

  it("formats dimension and metric names", () => {
    render(
      <PivotTable
        data={data}
        config={{
          dimensions: ["model_name", "time_period"],
          metrics: ["request_count", "avg_duration"],
        }}
      />,
    );
    for (const name of [
      "Model Name / Time Period",
      "Request Count",
      "Avg Duration",
    ]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  it("returns empty rows to its parent instead of rendering an empty state", () => {
    const { result } = renderHook(() => usePivotTable({ data: [] }));
    expect(result.current.visualization.rows).toEqual([]);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("prepares a common table contract with hierarchy and totals", () => {
    const { result } = renderHook(() =>
      usePivotTable({
        data: [
          { dimension: "OpenAI", time_dimension: "2026-01-01", metric: 12 },
          { dimension: "OpenAI", time_dimension: "2026-01-02", metric: 8 },
        ],
        config: {
          dimensions: ["dimension", "time_dimension"],
          metrics: ["metric"],
        },
      }),
    );
    const { visualization } = result.current;
    expect(visualization.type).toBe("table");
    expect(visualization.columns).toEqual([
      { id: "dimension", label: "Dimension / Time Dimension" },
      expect.objectContaining({ id: "metric", align: "right" }),
    ]);
    expect(visualization.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ emphasis: "subtotal" }),
        expect.objectContaining({ emphasis: "total" }),
        expect.objectContaining({
          cells: [
            expect.objectContaining({ indent: 1 }),
            expect.objectContaining({ value: "12" }),
          ],
        }),
      ]),
    );
  });

  it("prepares nested numeric metrics", () => {
    render(
      <PivotTable
        data={[
          ...data,
          {
            time_dimension: "2024-01-01",
            dimension: "other",
            metric: [
              [10, 20],
              [30, 40],
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("200").length).toBeGreaterThan(0);
  });

  it("retains controlled sorting", () => {
    const onSortChange = vi.fn();
    render(
      <PivotTable
        data={data}
        sortState={{ column: "metric", order: "ASC" }}
        onSortChange={onSortChange}
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: /Metric/ }),
    ).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: /Metric/ }));
    expect(onSortChange).toHaveBeenCalledWith(null);
  });
});
