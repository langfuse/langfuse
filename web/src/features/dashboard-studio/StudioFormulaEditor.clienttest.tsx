import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type StudioQuery, type StudioWidgetConfig } from "@langfuse/shared";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { StudioFormulaEditor } from "./StudioFormulaEditor";
import {
  createStudioFormulaOperands,
  displayStudioFormula,
  lowerStudioFormula,
  studioAuthoringError,
  applyStudioSeriesVisibility,
  getStudioFormulaOnlyVisibility,
  getStudioSeriesVisibility,
} from "./studioFormulaAuthoring";
import { evaluateStudioFormula } from "../dashboard/lib/studioExpressions";
import { studioMetricFormatter } from "./prepareStudioChart";

const queries: StudioQuery[] = [
  {
    id: "errors_legacy",
    label: "Failed requests",
    view: "observations",
    metrics: [{ id: "total", measure: "count", aggregation: "count" }],
    dimensions: [],
    filters: [],
    hidden: true,
  },
  {
    id: "request_totals",
    label: "All requests",
    view: "observations",
    metrics: [{ id: "total", measure: "count", aggregation: "count" }],
    dimensions: [],
    filters: [],
    hidden: true,
  },
  {
    id: "latency_old",
    label: "Latency",
    view: "observations",
    metrics: [
      { id: "median", measure: "latency", aggregation: "p50" },
      { id: "tail", measure: "latency", aggregation: "p99" },
    ],
    dimensions: [],
    filters: [],
  },
];

beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe("formula field guidance", () => {
  it("isolates a one-input formula and restores prior visibility without undoing newly added series", () => {
    const config: StudioWidgetConfig = {
      version: 1,
      title: "Custom",
      description: "",
      queries: [{ ...queries[0], hidden: false }],
      expressions: [
        {
          id: "custom",
          label: "Keep this name",
          formula: "errors_legacy.total * 2",
          hidden: true,
        },
      ],
      display: {
        chartType: "VERTICAL_BAR",
        hiddenSeriesIds: [
          "custom",
          'custom:{"model":"one"}',
          "errors_legacy.total",
        ],
      },
    };
    const previous = getStudioSeriesVisibility(config);
    const isolated = applyStudioSeriesVisibility(
      config,
      getStudioFormulaOnlyVisibility(config, "custom"),
    );
    expect(isolated.queries[0]).toEqual({ ...config.queries[0], hidden: true });
    expect(isolated.expressions).toEqual([
      { ...config.expressions[0], hidden: false },
    ]);
    expect(isolated.display.hiddenSeriesIds).toEqual(["errors_legacy.total"]);
    const restored = applyStudioSeriesVisibility(
      {
        ...isolated,
        queries: [...isolated.queries, { ...queries[1], hidden: false }],
        display: {
          ...isolated.display,
          hiddenSeriesIds: [
            ...isolated.display.hiddenSeriesIds!,
            "request_totals.total",
          ],
        },
      },
      previous,
    );
    expect(restored.queries[0]).toEqual(config.queries[0]);
    expect(restored.queries[1].hidden).toBe(false);
    expect(restored.expressions).toEqual(config.expressions);
    expect(restored.display.hiddenSeriesIds).toContain("request_totals.total");
    expect(restored.display.hiddenSeriesIds).toContain("custom");
  });
  it("commits a manual formula edit once across Enter and blur, without capturing unchanged focus", () => {
    const onCommit = vi.fn();
    render(
      <StudioFormulaEditor
        expression={{
          id: "rate",
          label: "Rate",
          formula: "errors_legacy.total",
        }}
        operands={createStudioFormulaOperands(queries, [], true)}
        letter="D"
        onChange={() => {}}
        onRemove={() => {}}
        onCommit={onCommit}
      />,
    );
    const input = screen.getByRole("textbox", { name: /^Formula$/ });
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "A / B" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith();
  });
  it("maps letters to stable legacy and multi-metric references without changing stored formulas", () => {
    const operands = createStudioFormulaOperands(
      queries,
      [
        {
          id: "old_rate",
          label: "Existing rate",
          formula: "errors_legacy.total / request_totals.total",
          hidden: true,
        },
      ],
      true,
    );
    const original = "old_rate + (latency_old.tail - latency_old.median) / 1e3";
    expect(displayStudioFormula(original, operands)).toBe(
      "D + (C.tail - C.median) / 1e3",
    );
    expect(lowerStudioFormula("A / B", operands)).toBe(
      "errors_legacy.total / request_totals.total",
    );
    expect(
      lowerStudioFormula(displayStudioFormula(original, operands), operands),
    ).toBe(original);
    expect(lowerStudioFormula("C / B", operands)).toBe(
      "C / request_totals.total",
    );
    expect(
      studioAuthoringError(lowerStudioFormula("C / B", operands), operands),
    ).toContain("C has 2 metrics");
    expect(
      studioAuthoringError(
        lowerStudioFormula("A + C.tail", operands),
        operands,
      ),
    ).toBe("Addition and subtraction require compatible units");
    expect(
      studioAuthoringError(
        "removed_query.count / request_totals.total",
        operands,
      ),
    ).toBe("Unknown reference: removed_query.count");
  });

  it("creates a fraction percentage from explicitly chosen hidden inputs without renaming or unhiding them", () => {
    const onChange = vi.fn();
    const expression = {
      id: "custom_rate",
      label: "My error rate",
      formula: "errors_legacy.total",
      hidden: true,
    };
    render(
      <StudioFormulaEditor
        expression={expression}
        operands={createStudioFormulaOperands(queries, [], true)}
        letter="D"
        onChange={onChange}
        onRemove={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Ratio or percentage"));
    fireEvent.click(screen.getByRole("button", { name: "Use percentage" }));
    const next = onChange.mock.lastCall![0];
    expect(next).toEqual({
      ...expression,
      formula: "errors_legacy.total / request_totals.total",
      unit: "percent",
    });
    const result = evaluateStudioFormula(
      next.formula,
      new Map([
        ["errors_legacy.total", { value: 1, unit: "observations" }],
        ["request_totals.total", { value: 8, unit: "observations" }],
      ]),
    );
    expect(result).toEqual({ value: 0.125, unit: "ratio" });
    expect(
      studioMetricFormatter(next.unit)(result.value!, { style: "full" }),
    ).toEqual({ main: "12.5", suffix: "%" });
    expect(queries.slice(0, 2).every((query) => query.hidden)).toBe(true);
  });
  it("uses the arithmetic parser for invalid syntax and accepts references to earlier formulas", () => {
    const props = {
      expression: { id: "ratio", label: "Ratio", formula: "a.count / (" },
      letter: "C",
      operands: [
        {
          reference: "a.count",
          token: "A",
          queryLetter: "A",
          label: "Requests",
          hidden: false,
        },
        {
          reference: "earlier_formula",
          token: "B",
          queryLetter: "B",
          label: "Earlier formula",
          hidden: false,
        },
      ],
      onChange: () => {},
      onRemove: () => {},
    };
    const { rerender } = render(<StudioFormulaEditor {...props} />);
    expect(
      screen
        .getByRole("textbox", { name: /^Formula$/ })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Expected a value");
    rerender(
      <StudioFormulaEditor
        {...props}
        expression={{
          ...props.expression,
          formula: "earlier_formula / a.count",
        }}
      />,
    );
    expect(
      screen
        .getByRole("textbox", { name: /^Formula$/ })
        .getAttribute("aria-invalid"),
    ).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
