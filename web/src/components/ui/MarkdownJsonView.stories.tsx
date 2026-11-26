import preview from "../../../.storybook/preview";
import { expect } from "storybook/test";
import { MarkdownJsonView } from "./MarkdownJsonView";

const meta = preview.meta({
  component: MarkdownJsonView,
});

export const ContentOnly = meta.story({
  name: "(Test) Content only",
  args: {
    content: "Hover this message to reveal its header controls.",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByTitle("Copy to clipboard"),
    ).not.toBeInTheDocument();
  },
});

export const JsonFallback = meta.story({
  name: "(Test) JSON fallback",
  args: { content: { status: "ready", count: 2 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("ready")).toBeVisible();
    await expect(
      canvas.queryByTitle("Copy to clipboard"),
    ).not.toBeInTheDocument();
  },
});
