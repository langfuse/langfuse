import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DataCard } from "./DataCard";
import { ControlledHoverCard } from "../ControlledHoverCard/ControlledHoverCard";
import { useState, type ComponentProps } from "react";

const numberComparisonHeights = [96, 160, 256];
const tableComparisonWidths = [240, 384, 640];
const comparisonColumns = [
  { id: "name", label: "Name" },
  { id: "value", label: "Value", align: "right" as const },
];
const tableCollapse = { collapsed: 5, expanded: 20 };

const meta = preview.meta({
  component: DataCard,
  args: {
    title: "Traces",
    metric: { value: "434.15K", description: "Total traces tracked" },
    content: {
      type: "line",
      data: [
        { x: new Date("2026-11-01"), values: { traces: 12 } },
        { x: new Date("2026-11-02"), values: { traces: 24 } },
      ],
      series: [{ id: "traces", label: "Traces", color: "hsl(var(--chart-1))" }],
      xAxis: { type: "time" },
      seriesOverflow: { visibleCount: 1, totalCount: 12 },
    },
  } satisfies ComponentProps<typeof DataCard>,
  decorators: [
    (Story) => (
      <div className="h-96 max-w-2xl">
        <Story />
      </div>
    ),
  ],
});

export const Ready = meta.story({
  name: "(Test) Ready",
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Traces" })).toBeVisible();
    await expect(canvas.getByText("434.15K")).toBeVisible();
    await expect(canvas.getByText("Showing top 1 of 12 series")).toBeVisible();
  },
});

export const Narrow = meta.story({
  name: "(Test) Narrow",
  render: (args) => (
    <div className="h-96 w-60">
      <DataCard {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const metric = canvas.getByText("434.15K").getBoundingClientRect();
    const label = canvas
      .getByText("Total traces tracked")
      .getBoundingClientRect();
    await expect(label.top).toBeGreaterThanOrEqual(metric.bottom - 1);
    await expect(Math.abs(label.left - metric.left)).toBeLessThan(2);
  },
});

export const Loading = meta.story({
  name: "(Test) Loading",
  args: { content: { type: "loading", progress: { type: "spinner" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Traces" })).toBeVisible();
    await expect(
      canvas.getByText("434.15K").closest("[aria-hidden]"),
    ).toHaveAttribute("aria-hidden", "true");
    await expect(canvas.getByRole("status")).toHaveAccessibleName(
      "Loading chart data",
    );
    await expect(canvas.getByText("Total traces tracked")).toBeVisible();
  },
});

export const LoadingTable = meta.story({
  name: "(Test) Loading table preserves columns",
  args: {
    content: {
      type: "loading",
      skeleton: "table",
      columns: [
        { id: "model", label: "Model" },
        { id: "tokens", label: "Tokens", align: "right" },
        { id: "cost", label: "USD", align: "right" },
      ],
      progress: { type: "spinner" },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Model")).toBeVisible();
    await expect(canvas.getByText("Tokens")).toBeVisible();
    await expect(canvas.getByText("USD")).toBeVisible();
    await expect(
      canvas.getAllByRole("columnheader", { hidden: true }),
    ).toHaveLength(3);
    await expect(getComputedStyle(canvas.getByText("USD")).textAlign).toBe(
      "right",
    );
  },
});

export const LoadingMetricWithProgress = meta.story({
  name: "(Test) Metric stays blurred during query progress",
  args: {
    content: {
      type: "loading",
      progress: {
        type: "determinate",
        fraction: 0.5,
        read_rows: 5000,
        total_rows_to_read: 10000,
      },
    },
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("progressbar", {}, { timeout: 3000 });
    const value = canvas.getByText("434.15K");
    const metric = value.parentElement!;
    await expect(metric).toHaveAttribute("aria-hidden", "true");
    await expect(getComputedStyle(metric).filter).not.toBe("none");
    const subtitle = canvas.getByText("Total traces tracked");
    await expect(metric).toContainElement(subtitle);
    await expect(metric).toHaveAttribute("inert");
    await expect(getComputedStyle(value).filter).toBe("none");
    await expect(getComputedStyle(subtitle.parentElement!).filter).toBe("none");
    await expect(getComputedStyle(metric).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
  },
});

export const LoadingNumber = meta.story({
  args: {
    metric: undefined,
    content: {
      type: "loading",
      skeleton: "number",
      progress: { type: "spinner" },
    },
  },
});

export const WithoutMetric = meta.story({ args: { metric: undefined } });

export const LoadingSubtitle = meta.story({
  name: "(Test) Loading subtitle reserves header height",
  render: (args) => (
    <div className="grid h-64 grid-cols-2 gap-4">
      <DataCard
        {...args}
        title="Loading widget"
        description={"\u00a0"}
        content={{ type: "loading", progress: { type: "spinner" } }}
      />
      <DataCard {...args} description="Total traces over time" />
    </div>
  ),
  play: async ({ canvas }) => {
    const [loadingMetric, loadedMetric] = canvas.getAllByText("434.15K");
    await expect(
      loadingMetric!.closest(".animate-in")!.getBoundingClientRect().top,
    ).toBe(loadedMetric!.closest(".animate-in")!.getBoundingClientRect().top);
  },
});

export const NumberLoadingLayoutComparison = meta.story({
  name: "(Test) Number loading uses loaded sizing",
  render: (args) => (
    <div className="flex flex-col gap-4">
      {numberComparisonHeights.map((height) => (
        <div
          key={height}
          className="grid w-96 grid-cols-2 gap-4"
          style={{ height }}
          data-testid={`number-${height}`}
        >
          <DataCard
            {...args}
            metric={undefined}
            content={{
              type: "loading",
              skeleton: "number",
              progress: { type: "spinner" },
            }}
          />
          <DataCard
            {...args}
            metric={undefined}
            content={{ type: "number", value: 8888 }}
          />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const height of numberComparisonHeights) {
      const pair = within(canvas.getByTestId(`number-${height}`));
      await waitFor(async () => {
        const [loading, loaded] = pair.getAllByText("8888");
        const before = loading!.getBoundingClientRect();
        const after = loaded!.getBoundingClientRect();
        await expect(Math.abs(before.top - after.top)).toBeLessThanOrEqual(1);
        await expect(before.height).toBe(after.height);
        await expect(before.width).toBe(after.width);
      });
    }
  },
});

export const LoadingLayoutComparison = meta.story({
  name: "(Test) Loading and loaded layout comparison",
  render: (args) => (
    <div className="flex flex-col gap-6">
      {tableComparisonWidths.map((width) => (
        <div
          key={width}
          style={{ width: width * 2 + 16 }}
          className="grid grid-cols-2 gap-4"
          data-testid={`comparison-${width}`}
        >
          {([true, false] as const).map((loading) => (
            <div key={String(loading)} className="h-64">
              <DataCard
                {...args}
                content={
                  loading
                    ? {
                        type: "loading",
                        skeleton: "table",
                        progress: { type: "spinner" },
                        columns: comparisonColumns,
                        collapse: tableCollapse,
                      }
                    : {
                        type: "table",
                        columns: comparisonColumns,
                        rows: Array.from({ length: 20 }, (_, index) => ({
                          id: String(index),
                          cells: [
                            { columnId: "name", value: "888888" },
                            { columnId: "value", value: "888888" },
                          ],
                        })),
                        collapse: tableCollapse,
                      }
                }
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const width of tableComparisonWidths) {
      const pair = canvas.getByTestId(`comparison-${width}`);
      await waitFor(async () => {
        const tables = pair.querySelectorAll("table");
        const loading = tables[0];
        const loaded = tables[1];
        if (!loading || !loaded) throw new Error("Comparison tables missing");
        await expect(loading.rows.length).toBe(loaded.rows.length);
        for (let row = 0; row < loading.rows.length; row++) {
          for (let cell = 0; cell < loading.rows[row]!.cells.length; cell++) {
            const before =
              loading.rows[row]!.cells[cell]!.getBoundingClientRect();
            const after =
              loaded.rows[row]!.cells[cell]!.getBoundingClientRect();
            await expect(Math.abs(before.top - after.top)).toBeLessThanOrEqual(
              1,
            );
            await expect(
              Math.abs(before.height - after.height),
            ).toBeLessThanOrEqual(1);
            await expect(
              Math.abs(before.width - after.width),
            ).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  },
});

export const DarkBackground = meta.story({
  name: "(Test) Dark card matches page background",
  args: {
    title: "Model costs",
    content: {
      type: "table",
      columns: [{ id: "model", label: "Model" }],
      rows: [
        { id: "model", cells: [{ columnId: "model", value: "Example model" }] },
      ],
    },
  },
  render: (args) => (
    <div
      className="dark bg-background h-96 p-4"
      data-testid="dashboard-background"
    >
      <DataCard {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const background = getComputedStyle(
      canvas.getByTestId("dashboard-background"),
    ).backgroundColor;
    const card = canvas
      .getByRole("heading", { name: "Model costs" })
      .closest(".group");
    const header = canvas
      .getByRole("columnheader", { name: "Model" })
      .closest("thead");
    if (!card || !header)
      throw new Error("Model costs card or table header not found");
    await expect(getComputedStyle(card).backgroundColor).toBe(background);
    await expect(getComputedStyle(header).backgroundColor).toBe(background);
  },
});

export const ShortTable = meta.story({
  name: "(Test) Short table keeps expand toggle visible",
  args: {
    title: "Models",
    content: {
      type: "table",
      columns: [{ id: "model", label: "Model" }],
      rows: Array.from({ length: 30 }, (_, index) => ({
        id: String(index),
        cells: [{ columnId: "model", value: `Model ${index + 1}` }],
      })),
      collapse: tableCollapse,
    },
  },
  render: (args) => (
    <div className="h-48">
      <DataCard {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("button", { name: "Show top 20" });
    const card = canvas
      .getByRole("heading", { name: "Models" })
      .closest(".group");
    if (!card) throw new Error("Models card not found");
    await expect(toggle).toBeVisible();
    await expect(toggle.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      card.getBoundingClientRect().bottom - 16,
    );
    await userEvent.click(toggle);
    const collapse = canvas.getByRole("button", { name: "See less" });
    await expect(collapse).toBeVisible();
    await expect(collapse.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      card.getBoundingClientRect().bottom - 16,
    );
  },
});

export const NumberWithLongDescription = meta.story({
  name: "(Test) Number with long description",
  args: {
    title: "Total count observations",
    description: "Shows the count of Observations",
    metric: undefined,
    content: { type: "number", value: 106677 },
  },
  render: (args) => (
    <div className="h-32 w-56">
      <DataCard {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const description = canvas.getByText("Shows the count of Observations");
    await expect(description).toBeVisible();
    const heading = canvas.getByRole("heading", {
      name: "Total count observations",
    });
    await expect(
      Math.abs(
        description.getBoundingClientRect().top -
          heading.getBoundingClientRect().bottom,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(description.scrollWidth).toBeGreaterThan(
      description.clientWidth,
    );
    await expect(
      description.getBoundingClientRect().height,
    ).toBeLessThanOrEqual(20);
  },
});

export const SelectControl = meta.story({
  args: {
    controls: [
      {
        id: "aggregation",
        type: "select",
        label: "Aggregation",
        value: "count",
        options: [
          { value: "count", label: "Count" },
          { value: "sum", label: "Sum" },
          {
            value: "average",
            label: "Average",
            disabled: true,
            disabledReason: "Unavailable for this metric",
          },
        ],
        onValueChange: fn(),
      },
    ],
  },
});

export const ConsistentHeaderHeight = meta.story({
  name: "(Test) Compact consistent header height",
  render: (args) => (
    <div className="grid h-96 grid-cols-2 gap-4">
      <DataCard {...args} title="Without control" />
      <DataCard
        {...args}
        title="With control"
        actions={{
          draggable: true,
          menu: [
            { id: "edit", type: "item", title: "Edit widget", onClick: fn() },
          ],
        }}
        controls={[
          {
            id: "aggregation",
            type: "select",
            label: "Aggregation",
            value: "count",
            options: [{ value: "count", label: "Count" }],
            onValueChange: fn(),
          },
        ]}
      />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const [withoutControl, withControl] = canvas.getAllByText("434.15K");
    await expect(withControl.getBoundingClientRect().top).toBe(
      withoutControl.getBoundingClientRect().top,
    );
    const heading = canvas
      .getByRole("heading", { name: "With control" })
      .getBoundingClientRect();
    await expect(
      Math.abs(withControl.getBoundingClientRect().top - heading.bottom - 16),
    ).toBeLessThanOrEqual(1);
    const select = canvas
      .getByRole("combobox", { name: "Aggregation" })
      .getBoundingClientRect();
    await expect(select.left).toBeGreaterThan(heading.right);
    await expect(
      Math.abs(
        select.top + select.height / 2 - heading.top - heading.height / 2,
      ),
    ).toBeLessThan(1);
    const menuButton = canvas.getByRole("button", { name: "Widget actions" });
    menuButton.focus();
    await expect(menuButton).toBeVisible();
    const menu = menuButton.getBoundingClientRect();
    await expect(menu.left).toBeLessThan(select.right);
    await expect(menu.right).toBeGreaterThan(select.left);
    await expect(menu.top).toBeLessThan(select.bottom);
    await expect(menu.bottom).toBeGreaterThan(select.top);
    await userEvent.click(menuButton);
    await waitFor(async () => {
      await expect(
        within(canvasElement.ownerDocument.body).getByRole("menuitem", {
          name: "Edit widget",
        }),
      ).toBeVisible();
    });
  },
});

function TableWithDocumentation(args: ComponentProps<typeof DataCard>) {
  const [open, setOpen] = useState(false);
  return (
    <ControlledHoverCard
      open={open}
      onOpenChange={setOpen}
      content={
        <div className="p-3 text-xs">
          <p>Cost across all models.</p>
          <a href="https://langfuse.com/docs/model-usage-and-cost">Read docs</a>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <DataCard
          {...args}
          metric={{
            value: "$20.00",
            description: "Total cost",
            documentation: getTriggerProps(),
          }}
        />
      )}
    </ControlledHoverCard>
  );
}

export const Table = meta.story({
  name: "(Test) Table",
  render: (args) => <TableWithDocumentation {...args} />,
  args: {
    title: "Model costs",
    content: {
      type: "table",
      columns: [
        { id: "model", label: "Model" },
        {
          id: "cost",
          label: "USD",
          align: "right",
          sort: "desc",
          onSort: fn(),
        },
      ],
      rows: [
        {
          id: "provider",
          cells: [
            { columnId: "model", value: "OpenAI" },
            { columnId: "cost", value: "" },
          ],
        },
        ...Array.from({ length: 20 }, (_, index) => ({
          id: String(index),
          cells: [
            { columnId: "model", value: `Model ${index + 1}`, indent: 1 },
            { columnId: "cost", value: "$1.00" },
          ],
        })),
        {
          id: "total",
          emphasis: "total",
          cells: [
            { columnId: "model", value: "Grand total" },
            { columnId: "cost", value: "$20.00" },
          ],
        },
      ],
      collapse: { collapsed: 5, expanded: 22 },
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("table")).toBeVisible();
    await expect(canvas.getByText("Total cost")).toBeVisible();
    await userEvent.hover(
      canvas.getByRole("button", { name: "More information" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(async () => {
      await expect(page.getByText("Cost across all models.")).toBeVisible();
    });
    await expect(page.getByRole("link", { name: "Read docs" })).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/model-usage-and-cost",
    );
  },
});
