import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { getViewDeclaration, type QueryType } from "@langfuse/shared/query";
import { UserChart } from "./UserChart";
import { ModelCostTable } from "./ModelCostTable";
import { useScheduledDashboardExecuteQuery } from "../hooks/useDashboardQueryScheduler";

vi.mock("../hooks/useDashboardQueryScheduler", () => ({
  useScheduledDashboardExecuteQuery: vi.fn(),
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("./cards/BarListChartArea", () => ({
  BarListChartArea: ({ data }: { data: unknown[] }) => (
    <div data-testid="bars">{data.length}</div>
  ),
}));
vi.mock("./cards/DashboardTable", () => ({
  DashboardTable: ({
    rows,
    children,
  }: React.PropsWithChildren<{ rows: unknown[] }>) => (
    <div>
      <div data-testid="rows">{rows.length}</div>
      {children}
    </div>
  ),
}));
vi.mock("@/src/components/layouts/doc-popup", () => ({
  default: () => null,
}));

const props = {
  projectId: "project",
  className: "",
  globalFilterState: [
    {
      column: "environment",
      type: "stringOptions" as const,
      operator: "any of" as const,
      value: ["production"],
    },
  ],
  fromTimestamp: new Date("2026-10-01T00:00:00Z"),
  toTimestamp: new Date("2026-10-02T00:00:00Z"),
  schedulerId: "dashboard:consumption",
};

const queryHook = vi.mocked(useScheduledDashboardExecuteQuery);

beforeEach(() => {
  queryHook.mockReset();
  queryHook.mockImplementation(({ query }) => {
    const countField = query.view === "traces" ? "count_count" : "uniq_traceId";
    const data = query.dimensions.length
      ? Array.from({ length: 21 }, (_, i) => ({
          userId: `user-${i}`,
          providedModelName: `model-${i}`,
          sum_totalCost: 1,
          sum_totalTokens: 100,
          [countField]: 1,
        })).slice(0, query.chartConfig?.row_limit ?? 21)
      : [{ sum_totalCost: 21, [countField]: 21 }];
    return { data, isPending: false, isLoading: false } as ReturnType<
      typeof useScheduledDashboardExecuteQuery
    >;
  });
});

function expectUnboundedTotals() {
  const calls = queryHook.mock.calls;
  const grouped = calls.filter(([input]) => input.query.dimensions.length > 0);
  const totals = calls.filter(([input]) => input.query.dimensions.length === 0);
  expect(totals).toHaveLength(grouped.length);
  for (const [input, options] of totals) {
    const matching = grouped.find(
      ([other]) =>
        other.query.view === input.query.view &&
        other.query.metrics[0]?.measure === input.query.metrics[0]?.measure,
    );
    expect(matching).toBeDefined();
    const [other] = matching!;
    expect(input).toMatchObject({
      projectId: other.projectId,
      version: other.version,
    });
    expect(input.query).toMatchObject({
      fromTimestamp: other.query.fromTimestamp,
      toTimestamp: other.query.toTimestamp,
      timeDimension: null,
      orderBy: null,
    } satisfies Partial<QueryType>);
    expect(input.query.filters).toEqual(
      expect.arrayContaining(other.query.filters),
    );
    const view = getViewDeclaration(input.query.view, input.version);
    const relations = (query: QueryType) =>
      new Set(
        [
          ...query.dimensions.map(({ field }) => view.dimensions[field]),
          ...query.filters.map(({ column }) => view.dimensions[column]),
          ...query.metrics.map(({ measure }) => view.measures[measure]),
        ]
          .map((field) => field?.relationTable)
          .filter(Boolean),
      );
    expect(relations(input.query)).toEqual(relations(other.query));
    expect(input.query.chartConfig).toBeUndefined();
    expect(other.query.chartConfig?.row_limit).toBe(20);
    expect(options?.queryId).toContain(props.schedulerId);
  }
  expect(new Set(calls.map(([, options]) => options?.queryId)).size).toBe(
    calls.length,
  );
}

describe.each(["v1", "v2"] as const)(
  "consumption totals (%s)",
  (metricsVersion) => {
    it("includes users beyond the displayed top 20 in cost and trace totals", () => {
      render(<UserChart {...props} metricsVersion={metricsVersion} />);
      expect(screen.getByText("$21.00")).toBeInTheDocument();
      expect(screen.getByTestId("bars")).toHaveTextContent("20");
      fireEvent.click(screen.getByText("Count of Traces", { selector: "a" }));
      expect(screen.getByText("21")).toBeInTheDocument();
      expectUnboundedTotals();
    });

    it("includes models beyond the displayed top 20 in total cost", () => {
      render(<ModelCostTable {...props} metricsVersion={metricsVersion} />);
      expect(screen.getByText("$21.00")).toBeInTheDocument();
      expect(screen.getByTestId("rows")).toHaveTextContent("20");
      expectUnboundedTotals();
    });
  },
);

it.each([UserChart, ModelCostTable])(
  "keeps the loading indicator while the total query is queued",
  (Component) => {
    const implementation = queryHook.getMockImplementation()!;
    queryHook.mockImplementation((input, options) => {
      const result = implementation(input, options);
      return input.query.dimensions.length
        ? result
        : { ...result, data: undefined, isPending: true, isLoading: false };
    });
    const { container } = render(<Component {...props} metricsVersion="v2" />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  },
);
