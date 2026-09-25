import preview from "../../../../../.storybook/preview";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import {
  LineChart,
  type LineChartLegend,
  type LineChartSeries,
  type LineChartThreshold,
} from "./LineChart";

type LineChartStoryProps = {
  legend?: LineChartLegend;
  thresholds?: LineChartThreshold[];
  variant?:
    | "default"
    | "empty"
    | "many-lines"
    | "boundary-points"
    | "negative-values"
    | "intermittent"
    | "intraday"
    | "year-boundary"
    | "monthly"
    | "category-short-labels"
    | "category-long-labels"
    | "category-hidden-labels";
};

const LineChartDemo = (props: LineChartStoryProps) => {
  if (
    props.variant === "category-short-labels" ||
    props.variant === "category-long-labels" ||
    props.variant === "category-hidden-labels"
  ) {
    let categoryChartData = categoryData;
    if (props.variant === "category-short-labels") {
      categoryChartData = shortCategoryData;
    }
    return (
      <LineChart
        data={categoryChartData}
        series={categorySeries}
        xAxis={{
          type: "category",
          labels:
            props.variant === "category-hidden-labels" ? "hidden" : "visible",
        }}
      />
    );
  }

  let chartData: Array<{
    x: Date;
    values: Record<string, number | null>;
  }> = data;
  if (props.variant === "many-lines") chartData = manyLinesData;
  if (props.variant === "boundary-points") chartData = boundaryPointData;
  if (props.variant === "negative-values") chartData = negativeData;
  if (props.variant === "intermittent") chartData = intermittentData;
  if (props.variant === "intraday") chartData = intradayData;
  if (props.variant === "year-boundary") chartData = yearBoundaryData;
  if (props.variant === "monthly") chartData = monthlyData;
  if (props.variant === "empty") chartData = [];
  const chartSeries = props.variant === "many-lines" ? manyLinesSeries : series;

  return (
    <LineChart
      data={chartData}
      series={chartSeries}
      legend={props.legend}
      valueFormatter={(value) => `$${value.toFixed(2)}`}
      thresholds={props.thresholds}
      showDataPointDots={props.variant === "boundary-points"}
      xAxis={{ type: "time" }}
    />
  );
};

const series = [
  { id: "api", label: "API", color: "#3a3dee" },
  { id: "worker", label: "Worker", color: "#07b9d5" },
];

const data = Array.from({ length: 14 }, (_, index) => ({
  x: new Date(Date.UTC(2026, 8, index + 1)),
  values: {
    api: 18 + index * 2 + Math.sin(index) * 8,
    worker: index === 7 ? null : 42 - index + Math.cos(index) * 6,
  },
}));

const boundaryPointData = [
  { x: new Date(Date.UTC(2026, 8, 1)), values: { api: 0, worker: null } },
  { x: new Date(Date.UTC(2026, 8, 2)), values: { api: 100, worker: null } },
];

const negativeData = [
  { x: new Date(Date.UTC(2026, 8, 1)), values: { api: -8, worker: null } },
  { x: new Date(Date.UTC(2026, 8, 2)), values: { api: -3, worker: null } },
];

const intermittentData = [
  { x: new Date(Date.UTC(2026, 8, 1)), values: { api: 8, worker: 3 } },
  { x: new Date(Date.UTC(2026, 8, 2)), values: { api: null, worker: null } },
  { x: new Date(Date.UTC(2026, 8, 3)), values: { api: 12, worker: 4 } },
];

const intradayData = Array.from({ length: 8 }, (_, index) => ({
  x: new Date(Date.UTC(2026, 8, 1, index * 3)),
  values: { api: index + 1, worker: index + 2 },
}));

const yearBoundaryData = [
  { x: new Date(Date.UTC(2025, 11, 31)), values: { api: 8, worker: 3 } },
  { x: new Date(Date.UTC(2026, 0, 1)), values: { api: 12, worker: 4 } },
];

const monthlyData = Array.from({ length: 12 }, (_, index) => ({
  x: new Date(Date.UTC(2026, index, 1)),
  values: { api: index + 1, worker: index + 2 },
}));

const manyLinesSeries: LineChartSeries[] = Array.from(
  { length: 24 },
  (_, index) => ({
    id: `series-${index + 1}`,
    label: `Series ${index + 1}`,
    color: `hsl(${Math.round((index / 24) * 360)} 70% 50%)`,
  }),
);

const manyLinesData = Array.from({ length: 30 }, (_, pointIndex) => ({
  x: new Date(Date.UTC(2026, 8, pointIndex + 1)),
  values: Object.fromEntries(
    manyLinesSeries.map((item, seriesIndex) => [
      item.id,
      50 +
        Math.sin(pointIndex / 2 + seriesIndex) * 18 +
        Math.cos(pointIndex / 5 + seriesIndex * 0.7) * 12 +
        seriesIndex * 2,
    ]),
  ),
}));

const categoryData = Array.from({ length: 6 }, (_, index) => ({
  x: `production-evaluation-run-${index + 1}-with-a-long-name`,
  values: { cost: 20 + index * 8 },
}));

const shortCategoryData = Array.from({ length: 6 }, (_, index) => ({
  x: `Run ${index + 1}`,
  values: { cost: 20 + index * 8 },
}));

const categorySeries: LineChartSeries[] = [
  { id: "cost", label: "Cost", color: "#3a3dee" },
];

const meta = preview.meta({
  component: LineChartDemo,
  parameters: { layout: "fullscreen" },
  args: {},
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

export const TooltipBelowChart = meta.story({
  name: "(Test) Tooltip Below Chart",
  decorators: [
    (Story) => (
      <div className="h-40 w-[420px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const hoverArea = canvasElement.querySelector<SVGRectElement>(
      'rect[fill="transparent"]',
    );
    if (!hoverArea) throw new Error("Chart hover area not found");
    fireEvent.pointerMove(hoverArea, {
      clientX: hoverArea.getBoundingClientRect().left + 4,
      clientY: hoverArea.getBoundingClientRect().top + 40,
    });
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await waitFor(() => {
      expect(tooltip.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        hoverArea.getBoundingClientRect().bottom,
      );
    });
  },
});

export const OnCardSurface = meta.story({
  name: "(Test) On Card Surface",
  decorators: [
    (Story) => (
      <div className="bg-card h-dvh w-full">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const hoverArea = canvasElement.querySelector<SVGRectElement>(
      'rect[fill="transparent"]',
    );
    if (!hoverArea) throw new Error("Hover area not found");
    await userEvent.hover(hoverArea);
    const activeLabel = canvasElement.querySelector<SVGTextElement>(
      "[data-active-x-axis-label]",
    );
    if (!activeLabel) throw new Error("Active label not found");
    await expect(
      canvasElement.querySelector("[data-active-x-axis-label-background]"),
    ).not.toBeInTheDocument();
    const activeBounds = activeLabel.getBoundingClientRect();
    for (const label of canvasElement.querySelectorAll<SVGTextElement>(
      "[data-x-axis-label]:not([data-active-x-axis-label])",
    )) {
      const bounds = label.getBoundingClientRect();
      await expect(
        bounds.right <= activeBounds.left || bounds.left >= activeBounds.right,
      ).toBe(true);
    }
  },
});

export const BoundaryPoints = meta.story({
  name: "(Test) Boundary Points",
  args: { variant: "boundary-points" },
  play: async ({ canvasElement }) => {
    const points = canvasElement.querySelectorAll<SVGCircleElement>(
      'circle[fill="#3a3dee"][r="4"]',
    );
    await expect(points).toHaveLength(2);
    for (const point of points) {
      const y = Number(point.getAttribute("cy"));
      const radius = Number(point.getAttribute("r"));
      await expect(y).toBeGreaterThanOrEqual(radius);
      await expect(y + radius).toBeLessThanOrEqual(
        point.ownerSVGElement?.height.baseVal.value ?? 0,
      );
    }
  },
});

export const NegativeValues = meta.story({
  name: "(Test) Negative Values",
  args: { variant: "negative-values" },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector("[data-zero-baseline]"),
    ).toBeInTheDocument();
  },
});

export const Empty = meta.story({
  name: "(Test) Empty",
  args: { variant: "empty" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("group", { name: "Line chart" }),
    ).toBeVisible();
    await expect(canvas.queryAllByRole("graphics-symbol")).toHaveLength(0);
  },
});

export const Intermittent = meta.story({
  name: "(Test) Intermittent",
  args: { variant: "intermittent" },
  play: async ({ canvasElement }) => {
    const tickLabels = Array.from(
      canvasElement.querySelectorAll('[data-x-axis-label=""]'),
      (label) => label.textContent,
    );
    await expect(tickLabels).toEqual(["Sep 1", "Sep 2", "Sep 3"]);
    const assertLabelsDoNotOverlap = () => {
      const labels = Array.from(
        canvasElement.querySelectorAll<SVGTextElement>(
          '[data-x-axis-label=""]',
        ),
        (label) => label.getBoundingClientRect(),
      ).sort((left, right) => left.left - right.left);
      for (let index = 1; index < labels.length; index++) {
        expect(labels[index]!.left).toBeGreaterThanOrEqual(
          labels[index - 1]!.right,
        );
      }
    };
    assertLabelsDoNotOverlap();
    const hoverArea = canvasElement.querySelectorAll<SVGRectElement>(
      'rect[fill="transparent"]',
    )[1];
    if (!hoverArea) throw new Error("Missing hover area for data gap");
    await userEvent.hover(hoverArea);
    await expect(within(document.body).getByRole("tooltip")).toHaveTextContent(
      "No data available",
    );
    assertLabelsDoNotOverlap();
  },
});

export const Intraday = meta.story({
  name: "(Test) Intraday",
  args: { variant: "intraday" },
  play: async ({ canvasElement }) => {
    const labels = Array.from(
      canvasElement.querySelectorAll('[data-x-axis-label=""]'),
      (label) => label.textContent,
    );
    await expect(labels.length).toBeGreaterThan(1);
    await expect(new Set(labels).size).toBe(labels.length);
    await expect(labels.some((label) => label?.includes("AM"))).toBe(true);
    const hoverArea = canvasElement.querySelector<SVGRectElement>(
      'rect[fill="transparent"]',
    );
    if (!hoverArea) throw new Error("Hover area not found");
    await userEvent.hover(hoverArea);
    await expect(within(document.body).getByRole("tooltip")).toHaveTextContent(
      "Sep 1, 2026, 12:00 AM",
    );
  },
});

export const YearBoundary = meta.story({
  name: "(Test) Year Boundary",
  args: { variant: "year-boundary" },
  play: async ({ canvasElement }) => {
    const labels = Array.from(
      canvasElement.querySelectorAll('[data-x-axis-label=""]'),
      (label) => label.textContent,
    );
    await expect(labels.some((label) => label?.includes("2025"))).toBe(true);
    await expect(labels.some((label) => label?.includes("2026"))).toBe(true);
  },
});

export const Monthly = meta.story({
  name: "(Test) Monthly",
  args: { variant: "monthly" },
  play: async ({ canvasElement }) => {
    const labels = Array.from(
      canvasElement.querySelectorAll('[data-x-axis-label=""]'),
      (label) => label.textContent,
    );
    await expect(labels.length).toBeGreaterThan(1);
    await expect(new Set(labels).size).toBe(labels.length);
    await expect(labels.every((label) => label?.includes("2026"))).toBe(true);
  },
});

export const ManyLines = meta.story({
  args: { variant: "many-lines" },
});

export const ManyLegendEntries = meta.story({
  name: "(Test) Many Legend Entries",
  args: {
    variant: "many-lines",
    legend: {
      visibility: "visible",
      interaction: "toggle",
      summary: "sum",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstPoint = canvas.getAllByRole("graphics-symbol")[0];
    if (!firstPoint) throw new Error("Data point not found");

    firstPoint.focus();

    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll("[data-active-data-point]"),
      ).toHaveLength(1),
    );
  },
});

export const WithLegend = meta.story({
  args: {
    legend: {
      visibility: "visible",
      interaction: "toggle",
      summary: "sum",
    },
  },
});

export const WithThreshold = meta.story({
  args: {
    thresholds: [
      {
        value: 40,
        color: "var(--color-red-600)",
        label: "Budget",
        region: "above",
      },
    ],
  },
});

export const CategoryLongLabels = meta.story({
  name: "(Test) Category Long Labels",
  args: { variant: "category-long-labels" },
  play: async ({ canvasElement }) => {
    const firstInteractionArea = canvasElement.querySelector(
      'rect[fill="transparent"]',
    );
    if (!firstInteractionArea) throw new Error("Interaction area not found");

    await userEvent.hover(firstInteractionArea);

    const activeLabel = canvasElement.querySelector(
      "[data-active-x-axis-label]",
    );
    await expect(activeLabel).toHaveTextContent(categoryData[0]?.x ?? "");
    await expect(activeLabel).toHaveAttribute("font-weight", "700");
    await expect(
      canvasElement.querySelector("[data-active-x-axis-label-background]"),
    ).not.toBeInTheDocument();

    const renderedLabels = canvasElement.querySelectorAll(
      "[data-x-axis-label]",
    );
    await expect(renderedLabels.length).toBeLessThan(categoryData.length);
    Array.from(renderedLabels)
      .filter((label) => !label.hasAttribute("data-active-x-axis-label"))
      .forEach((label) => {
        expect(label).not.toHaveAttribute("transform");
        expect(label.textContent).toMatch(/…$/);
      });
    await expect(
      canvasElement.querySelectorAll("[data-category-tick]"),
    ).toHaveLength(categoryData.length);

    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent(categoryData[0]?.x ?? "");
    await expect(tooltip.querySelector("svg")).toBeNull();
  },
});

export const CategoryShortLabels = meta.story({
  name: "(Test) Category Short Labels",
  args: { variant: "category-short-labels" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    shortCategoryData.forEach(({ x }) => {
      expect(canvas.getByText(x)).not.toHaveAttribute("transform");
    });
    await expect(
      canvasElement.querySelectorAll("[data-category-tick]"),
    ).toHaveLength(shortCategoryData.length);
  },
});

export const CategoryHiddenLabels = meta.story({
  args: { variant: "category-hidden-labels" },
});

export const KeyboardFocus = meta.story({
  name: "(Test) Keyboard Focus",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstPoint = canvas.getByLabelText(/2026.*API.*18/);

    firstPoint.focus();

    const activeLabel = await waitFor(() => {
      const label = canvasElement.querySelector("[data-active-x-axis-label]");
      expect(label).toHaveTextContent("Sep 1");
      return label;
    });
    await expect(activeLabel).toHaveAttribute("font-weight", "700");
    await expect(
      canvasElement.querySelector("[data-active-x-axis-label-background]"),
    ).not.toBeInTheDocument();

    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("API");
    await expect(tooltip).toHaveTextContent("$18.00");

    const firstTooltipLeft = tooltip.getBoundingClientRect().left;
    const points = canvas.getAllByRole("graphics-symbol");
    const nextPoint = points[points.indexOf(firstPoint) + 1];
    await userEvent.tab();

    await expect(nextPoint).toHaveFocus();
    await waitFor(() =>
      expect(tooltip.getBoundingClientRect().left).not.toBe(firstTooltipLeft),
    );
  },
});
