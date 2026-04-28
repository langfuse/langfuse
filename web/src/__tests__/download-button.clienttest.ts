import { createChartCsvContent } from "@/src/features/widgets/chart-library/DownloadButton";

describe("createChartCsvContent", () => {
  it("exports regular chart rows as CSV", () => {
    const csv = createChartCsvContent({
      data: [
        { dimension: "alpha", metric: 1 },
        { dimension: "needs, escaping", metric: 2 },
      ],
    });

    expect(csv).toBe('dimension,metric\nalpha,1\n"needs, escaping",2');
  });

  it("exports transformed pivot table rows as CSV", () => {
    const csv = createChartCsvContent({
      data: [
        {
          environment: "production",
          model: "gpt-4",
          count_count: 3,
          sum_total_cost: 1.25,
          dimension: "environment",
          metric: 0,
        },
        {
          environment: "production",
          model: "gpt-3.5",
          count_count: 2,
          sum_total_cost: 0.75,
          dimension: "environment",
          metric: 0,
        },
        {
          environment: "staging",
          model: "gpt-4",
          count_count: 1,
          sum_total_cost: 0.5,
          dimension: "environment",
          metric: 0,
        },
      ],
      pivotTableConfig: {
        dimensions: ["environment", "model"],
        metrics: ["count_count", "sum_total_cost"],
        rowLimit: 20,
      },
    });

    expect(csv).toBe(
      [
        "Environment / Model,Count,Sum Total Cost",
        "Total,6,2.5",
        "production (Subtotal),5,2",
        "production - gpt-3.5,2,0.75",
        "production - gpt-4,3,1.25",
        "staging (Subtotal),1,0.5",
        "staging - gpt-4,1,0.5",
      ].join("\n"),
    );
  });

  it("exports pivot tables with multiple group-bys as grouped CSV rows", () => {
    const csv = createChartCsvContent({
      data: [
        {
          environment: "production",
          model: "gpt-4",
          count_count: 4,
          dimension: "environment",
          metric: 0,
        },
        {
          environment: "production",
          model: "claude-3",
          count_count: 2,
          dimension: "environment",
          metric: 0,
        },
        {
          environment: "staging",
          model: "gpt-3.5",
          count_count: 1,
          dimension: "environment",
          metric: 0,
        },
      ],
      pivotTableConfig: {
        dimensions: ["environment", "model"],
        metrics: ["count_count"],
        rowLimit: 20,
      },
    });

    expect(csv).toBe(
      [
        "Environment / Model,Count",
        "Total,7",
        "production (Subtotal),6",
        "production - claude-3,2",
        "production - gpt-4,4",
        "staging (Subtotal),1",
        "staging - gpt-3.5,1",
      ].join("\n"),
    );
  });

  it("exports pivot table rows with the active sort order", () => {
    const csv = createChartCsvContent({
      data: [
        {
          environment: "production",
          count_count: 3,
          dimension: "environment",
          metric: 0,
        },
        {
          environment: "staging",
          count_count: 1,
          dimension: "environment",
          metric: 0,
        },
      ],
      pivotTableConfig: {
        dimensions: ["environment"],
        metrics: ["count_count"],
      },
      sortState: { column: "count_count", order: "ASC" },
    });

    expect(csv).toBe(
      ["Environment,Count", "Total,4", "staging,1", "production,3"].join("\n"),
    );
  });
});
