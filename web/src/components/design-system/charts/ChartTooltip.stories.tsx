import { type ComponentProps } from "react";
import preview from "../../../../.storybook/preview";
import { expect, spyOn, userEvent, within } from "storybook/test";

import { ChartTooltip } from "../internal/charts/ChartTooltip";

type ChartTooltipController = Parameters<
  ComponentProps<typeof ChartTooltip>["children"]
>[0];

type ChartTooltipDemoProps = {
  data: Parameters<ChartTooltipController["getReferenceProps"]>[0];
};

function ChartTooltipDemo({ data }: ChartTooltipDemoProps) {
  return (
    <ChartTooltip>
      {({ activeIndex, getReferenceProps }) => (
        <svg
          viewBox="0 0 480 240"
          className="h-full w-full"
          aria-label="Tooltip story chart"
        >
          <rect
            x="120"
            y="60"
            width="240"
            height="120"
            rx="12"
            fill={activeIndex === data.index ? "#6366f1" : "#a5b4fc"}
            className="outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2"
            role="graphics-symbol"
            tabIndex={0}
            aria-label="Tooltip trigger"
            {...getReferenceProps(data)}
          />
        </svg>
      )}
    </ChartTooltip>
  );
}

async function focusTooltip(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  canvas.getByLabelText("Tooltip trigger").focus();
  return within(canvasElement.ownerDocument.body).findByRole("tooltip");
}

const itemsData: ChartTooltipDemoProps["data"] = {
  type: "items",
  index: 0,
  items: [
    { id: "api", label: "API", value: "$18.42", color: "#6366f1" },
    { id: "worker", label: "Worker", value: "$12.08", color: "#06b6d4" },
  ],
};

const meta = preview.meta({
  component: ChartTooltipDemo,
  parameters: { layout: "fullscreen" },
  args: {
    data: itemsData,
  },
  decorators: [
    (Story) => (
      <div className="h-dvh w-full p-8">
        <Story />
      </div>
    ),
  ],
});

export const Items = meta.story({
  name: "(Test) Items",
  args: { data: itemsData },
  play: async ({ canvasElement }) => {
    const tooltip = await focusTooltip(canvasElement);
    await expect(tooltip).toHaveTextContent("API");
    await expect(tooltip).toHaveTextContent("$18.42");
    await expect(tooltip.querySelectorAll("rect")).toHaveLength(2);
  },
});

export const NoData = meta.story({
  name: "(Test) No Data",
  args: {
    data: {
      type: "empty",
      index: 0,
      heading: "September 22, 2026",
    },
  },
  play: async ({ canvasElement }) => {
    const tooltip = await focusTooltip(canvasElement);
    await expect(tooltip).toHaveTextContent("September 22, 2026");
    await expect(tooltip).toHaveTextContent("No data available");
  },
});

export const WithHeading = meta.story({
  name: "(Test) With Heading",
  args: {
    data: {
      type: "items",
      index: 0,
      heading: "September 22, 2026",
      items: [
        { id: "api", label: "API", value: "1,240", color: "#6366f1" },
        { id: "worker", label: "Worker", value: "830", color: "#06b6d4" },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const tooltip = await focusTooltip(canvasElement);
    await expect(tooltip).toHaveTextContent("September 22, 2026");
  },
});

export const Emphasis = meta.story({
  name: "(Test) Emphasis",
  args: {
    data: {
      type: "items",
      index: 0,
      emphasizedItemId: "emphasized",
      items: [
        {
          id: "emphasized",
          label: "Emphasized",
          value: "82",
          color: "#6366f1",
        },
        {
          id: "dimmed-a",
          label: "Dimmed",
          value: "12",
          color: "#f59e0b",
        },
        {
          id: "dimmed-b",
          label: "Also dimmed",
          value: "8",
          color: "#06b6d4",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const tooltip = await focusTooltip(canvasElement);
    await expect(
      within(tooltip).getByText("Dimmed").closest(".opacity-30"),
    ).toBeInTheDocument();
  },
});

export const Primary = meta.story({
  name: "(Test) Primary",
  args: {
    data: {
      type: "primary",
      index: 0,
      label: "Claude Sonnet",
      value: "31 (31%)",
      color: "#6366f1",
    },
  },
  play: async ({ canvasElement }) => {
    const tooltip = await focusTooltip(canvasElement);
    await expect(tooltip).toHaveTextContent("Claude Sonnet");
    await expect(tooltip).toHaveTextContent("31 (31%)");
    await expect(within(tooltip).getByText("Claude Sonnet")).toHaveClass(
      "text-foreground",
    );
  },
});

export const PrimaryWithDetails = meta.story({
  name: "(Test) Primary With Details",
  args: {
    data: {
      type: "primary",
      index: 0,
      heading: "Other",
      label: "Combined slices",
      value: "8 (8%)",
      color: "#6366f1",
      details: [
        { label: "Small model", value: "5 (5%)" },
        { label: "Legacy model", value: "3 (3%)" },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const tooltip = await focusTooltip(canvasElement);
    await expect(tooltip).toHaveTextContent("Combined slices");
    await expect(tooltip).toHaveTextContent("Small model");
    await expect(tooltip).toHaveTextContent("Legacy model");
    await expect(within(tooltip).getByRole("separator")).toBeInTheDocument();
  },
});

export const WithCopyHint = meta.story({
  name: "(Test) With Copy Hint",
  args: {
    data: {
      type: "primary",
      index: 0,
      label: "Alpha",
      value: "12",
      copyLabel: "Alpha",
      hint: "Click or press Enter to copy label",
    },
  },
  play: async ({ canvasElement }) => {
    const tooltip = await focusTooltip(canvasElement);
    const hint = within(tooltip).getByText(
      "Click or press Enter to copy label",
    );
    await expect(hint).toBeVisible();
    await expect(hint.parentElement).toHaveClass(
      "border-t",
      "text-muted-foreground/70",
    );
    await expect(
      Number.parseFloat(getComputedStyle(hint).fontSize),
    ).toBeLessThan(Number.parseFloat(getComputedStyle(tooltip).fontSize));
    const widthBeforeCopy = tooltip.getBoundingClientRect().width;
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(
        within(canvasElement).getByLabelText("Tooltip trigger"),
      );
      await expect(copy).toHaveBeenCalledWith("Alpha");
      await expect(hint).not.toBeVisible();
      await expect(
        within(tooltip).getByText("Label copied to clipboard"),
      ).toBeVisible();
      await expect(tooltip.getBoundingClientRect().width).toBeCloseTo(
        widthBeforeCopy,
        0,
      );
    } finally {
      copy.mockRestore();
    }
  },
});

export const LongContent = meta.story({
  name: "(Test) Long Content",
  args: {
    data: {
      type: "items",
      index: 0,
      heading: "A deliberately long heading for a dense chart tooltip",
      items: [
        {
          id: "long-model",
          label: "A model name that is intentionally long enough to truncate",
          value: "$1,234,567.890123",
          color: "#6366f1",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const tooltip = await focusTooltip(canvasElement);
    await expect(tooltip).toBeVisible();
  },
});

export const PointerHover = meta.story({
  name: "(Test) Pointer Hover",
  args: { data: itemsData },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByLabelText("Tooltip trigger"));

    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toBeVisible();
  },
});
