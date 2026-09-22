import preview from "../../../../../.storybook/preview";
import { expect, within } from "storybook/test";
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

export const SubtleFill = meta.story({
  args: {
    variant: "subtle",
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

    await expect(canvasElement.querySelectorAll("path")).toHaveLength(3);
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

    await expect(canvasElement.querySelectorAll("circle")).toHaveLength(1);
    await expect(canvas.getByText("0")).toBeInTheDocument();
    await expect(canvas.getByText("Total")).toBeInTheDocument();
  },
});
