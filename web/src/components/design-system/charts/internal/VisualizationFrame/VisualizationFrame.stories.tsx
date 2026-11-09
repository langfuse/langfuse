import { type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SLOW_QUERY_HINT_TEXT } from "@langfuse/shared";
import preview from "../../../../../../.storybook/preview";
import { VisualizationFrame } from "./VisualizationFrame";

const meta = preview.meta({
  component: VisualizationFrame,
  decorators: [
    (Story) => (
      <div className="h-64 w-96">
        <Story />
      </div>
    ),
  ],
});

export const Loading = meta.story({
  args: { content: { type: "loading", progress: { type: "spinner" } } },
});

export const LoadingWithProgress = meta.story({
  name: "(Test) Loading with progress",
  args: {
    content: {
      type: "loading",
      layout: "compact",
      progress: {
        type: "determinate",
        fraction: 0.5,
        read_rows: 5000,
        total_rows_to_read: 10000,
      },
      hintText: "Still reading chart data",
      showHintImmediately: true,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("progressbar", {}, { timeout: 3000 }),
    ).toHaveAttribute("aria-valuenow", "50");
  },
});

export const Indeterminate = meta.story({
  args: {
    content: {
      type: "loading",
      progress: { type: "indeterminate" },
      showHintImmediately: true,
    },
  },
});

export const TightLoading = meta.story({
  args: {
    content: {
      type: "loading",
      layout: "tight",
      progress: { type: "indeterminate" },
      showHintImmediately: true,
    },
  },
});

export const Empty = meta.story({ args: { content: { type: "empty" } } });

export const EmptyWithHelp = meta.story({
  args: {
    content: {
      type: "empty",
      description: "No chart data available for the selected runs.",
      href: "https://langfuse.com/docs",
    },
  },
});

export const ErrorWithRetry = meta.story({
  name: "(Test) Error with retry",
  args: {
    content: {
      type: "error",
      message: "Unable to load chart data",
      onRetry: fn(),
    },
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Retry" }));
    if (args.content.type === "error")
      await expect(args.content.onRetry).toHaveBeenCalledOnce();
  },
});

export const ResourceLimitError = meta.story({
  args: { content: { type: "error", message: SLOW_QUERY_HINT_TEXT } },
});

export const Confirmation = meta.story({
  name: "(Test) Confirmation",
  args: {
    content: {
      type: "confirmation",
      title: "Render chart?",
      description: "Rendering this chart may slow down your browser.",
      actionLabel: "Render anyway",
      onConfirm: fn(),
    },
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Render anyway" }),
    );
    if (args.content.type === "confirmation")
      await expect(args.content.onConfirm).toHaveBeenCalledOnce();
  },
});

const table = {
  type: "table",
  columns: [
    { id: "name", label: "Name" },
    { id: "count", label: "Count", align: "right" },
  ],
  rows: Array.from({ length: 10 }, (_, index) => ({
    id: String(index),
    cells:
      index === 1
        ? [{ columnId: "count", value: 42 }]
        : [
            { columnId: "count", value: index },
            { columnId: "name", value: `Row ${index}` },
          ],
  })),
} satisfies ComponentProps<typeof VisualizationFrame>["content"];

export const Table = meta.story({
  name: "(Test) Table",
  args: { content: { ...table, collapse: { collapsed: 2, expanded: 5 } } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByRole("row")).toHaveLength(3));
    const rows = canvas.getAllByRole("row");
    await expect(
      within(rows[1]!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Row 0", "0"]);
    await expect(
      within(rows[2]!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["", "42"]);
    await expect(
      getComputedStyle(canvas.getByRole("cell", { name: "42" })).textAlign,
    ).toBe("right");
    await userEvent.click(canvas.getByRole("button", { name: "Show top 5" }));
    await expect(canvas.getAllByRole("row")).toHaveLength(6);
    await userEvent.click(canvas.getByRole("button", { name: "See less" }));
    await waitFor(() => expect(canvas.getAllByRole("row")).toHaveLength(3));
  },
});

export const TableWithoutExpansion = meta.story({
  name: "(Test) Table without expansion",
  args: { content: { ...table, collapse: { collapsed: 5, expanded: 2 } } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByRole("row")).toHaveLength(3));
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
});
