import preview from "../../../../../.storybook/preview";
import { expect, spyOn, userEvent, waitFor, within } from "storybook/test";
import { chartColors } from "../constants";
import { PieChart } from "./PieChart";

const data = [
  { label: "GPT-5", value: 46 },
  { label: "Claude Sonnet", value: 31 },
  { label: "Gemini Pro", value: 15 },
  { label: "Other", value: 8 },
];

const meta = preview.meta({
  component: PieChart,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    data,
    valueFormatter: (value) => value.toLocaleString(),
  },
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

export const HoverColors = meta.story({
  name: "(Test) Hover Colors",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = canvas.getByRole("graphics-symbol", { name: "GPT-5: 46" });
    const second = canvas.getByRole("graphics-symbol", {
      name: "Claude Sonnet: 31",
    });

    await userEvent.hover(first);
    await expect(second).toHaveAttribute(
      "fill",
      expect.stringContaining("20%"),
    );

    await userEvent.unhover(first);
    await expect(second).toHaveAttribute("fill", chartColors[1]);
  },
});

export const LongLabels = meta.story({
  args: {
    data: [
      {
        label: "A model name that is intentionally long enough to truncate",
        value: 72_350,
      },
      { label: "Short model", value: 27_650 },
    ],
  },
});

export const CenterTextFits = meta.story({
  name: "(Test) Center Text Fits",
  args: {
    data: [{ label: "Production", value: 2.722947 }],
    valueFormatter: (value) => `$${value.toFixed(6)}`,
    centerLabel: "Total cost",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const total = canvas.getByText("$2.722947");
    const label = canvas.getByText("Total cost");
    const svg = canvasElement.querySelector("svg");
    if (!svg) throw new Error("Missing pie chart SVG");
    const container = svg.parentElement;
    if (!container) throw new Error("Missing chart container");

    for (const size of [420, 160, 120, 320]) {
      container.style.width = `${size}px`;
      container.style.height = `${size}px`;

      await waitFor(async () => {
        const chart = svg.getBoundingClientRect();
        await expect(Math.abs(chart.width - size)).toBeLessThan(1);
        await expect(Math.abs(chart.height - size)).toBeLessThan(1);
        if (size === 120) {
          await expect(total).not.toBeVisible();
          await expect(label).not.toBeVisible();
          await expect(svg).toBeVisible();
          return;
        }
        await expect(total).toBeVisible();
        await expect(label).toBeVisible();
        const centerX = chart.x + chart.width / 2;
        const centerY = chart.y + chart.height / 2;
        const radius = Math.min(chart.width, chart.height) * (2 / 7);

        const fits = [total, label].every((element) => {
          const rect = element.getBoundingClientRect();
          return [rect.left, rect.right].every((x) =>
            [rect.top, rect.bottom].every(
              (y) => Math.hypot(x - centerX, y - centerY) <= radius + 1,
            ),
          );
        });
        await expect(fits).toBe(true);
      });
    }
  },
});

export const KeyboardFocus = meta.story({
  name: "(Test) Keyboard Focus",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slice = canvas.getByLabelText("Claude Sonnet: 31");

    slice.focus();

    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Claude Sonnet");
    await expect(tooltip).toHaveTextContent("31");
    await expect(tooltip).toHaveTextContent(
      "Click or press Enter to copy label",
    );
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(slice);
      await expect(copy).toHaveBeenCalledWith("Claude Sonnet");
      slice.focus();
      await userEvent.keyboard("{Enter}");
      await expect(copy).toHaveBeenCalledTimes(2);
    } finally {
      copy.mockRestore();
    }
  },
});

export const NonPositiveValues = meta.story({
  name: "(Test) Non-positive Values",
  args: {
    data: [
      { label: "Zero", value: 0 },
      { label: "Negative", value: -2 },
      { label: "NaN", value: Number.NaN },
      { label: "Infinity", value: Number.POSITIVE_INFINITY },
      { label: "Positive", value: 2 },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll("path")).toHaveLength(1);
  },
});

export const CombinedSmallSlices = meta.story({
  name: "(Test) Combined Small Slices",
  args: {
    data: [
      { label: "Other", value: 96 },
      { label: "Main", value: 2 },
      { label: "Tiny A", value: 1 },
      { label: "Tiny B", value: 1 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const combinedSlice = canvas.getByLabelText("Other: 2");

    combinedSlice.focus();

    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Tiny A");
    await expect(tooltip).toHaveTextContent("Tiny B");
    await expect(tooltip).toHaveTextContent("1 (1%)");
  },
});

export const MinimumVisibleSlice = meta.story({
  args: {
    data: [
      { label: "Main", value: 999 },
      { label: "Tiny", value: 1 },
    ],
  },
});

export const Empty = meta.story({
  name: "(Test) Empty",
  args: {
    data: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("0")).toBeInTheDocument();
    await expect(canvas.getByText("Total")).toBeInTheDocument();
  },
});
