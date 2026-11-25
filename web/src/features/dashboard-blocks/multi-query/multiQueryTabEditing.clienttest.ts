import { expect, it } from "vitest";
import { type MultiQueryTab } from "@langfuse/shared/dashboards";
import { splitMultiQueryTabByUnit } from "./multiQueryTabEditing";

it("moves plotted cost and keeps its hidden input available to a formula on the original tab", () => {
  const source: MultiQueryTab = {
    id: "overview",
    label: "Usage",
    queries: [
      {
        id: "usage",
        label: "Usage",
        view: "observations",
        metrics: [
          { id: "cost", measure: "totalCost", aggregation: "sum" },
          { id: "tokens", measure: "totalTokens", aggregation: "sum" },
        ],
        dimensions: [],
        filters: [],
        orderBy: [{ field: "sum_totalCost", direction: "desc" }],
      },
    ],
    formulas: [
      {
        id: "ratio",
        label: "Cost per token",
        expression: "usage.cost / usage.tokens",
        format: "number",
      },
    ],
    display: { chartType: "LINE_TIME_SERIES" },
  };
  const [usage, cost] = splitMultiQueryTabByUnit(source, "USD", "v4", "tab2");
  expect(usage.queries[0]?.metrics.map((m) => [m.id, !!m.hidden])).toEqual([
    ["cost", true],
    ["tokens", false],
  ]);
  expect(usage.formulas).toEqual(source.formulas);
  expect(cost.formulas).toEqual([]);
  expect(cost.queries[0]?.metrics.map((m) => [m.id, !!m.hidden])).toEqual([
    ["cost", false],
    ["tokens", true],
  ]);
  expect(cost.queries[0]?.orderBy).toEqual(source.queries[0]?.orderBy);
  expect(source.queries[0]?.metrics[0]?.hidden).toBeUndefined();
});
