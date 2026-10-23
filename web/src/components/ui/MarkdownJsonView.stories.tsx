import preview from "../../../.storybook/preview";
import { expect, waitFor, within } from "storybook/test";
import { MarkdownJsonView } from "./MarkdownJsonView";

const meta = preview.meta({
  component: MarkdownJsonView,
});

export const HeaderControlsOnFocus = meta.story({
  name: "(Test) Reveals Header Controls On Focus",
  args: {
    content: "Hover this message to reveal its header controls.",
    title: "assistant",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const copyButton = canvas.getByTitle("Copy to clipboard");
    await waitFor(() => expect(copyButton).not.toBeVisible());
    copyButton.focus();
    await waitFor(() => expect(copyButton).toBeVisible());
  },
});
