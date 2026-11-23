import { expect, spyOn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { CopyInput } from "./CopyInput";

const meta = preview.meta({
  component: CopyInput,
});

export const Default = meta.story({
  args: {
    "aria-label": "Project ID",
    value: "project-example",
    copyLabel: "Copy project ID",
  },
});

export const TestCopiesValue = meta.story({
  name: "(Test) Copies the read-only value",
  args: Default.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Project ID" });
    await expect(input).toHaveValue("project-example");
    await expect(input).toHaveAttribute("readonly");

    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(input);
      await userEvent.tab();
      await expect(
        canvas.getByRole("button", { name: "Copy project ID" }),
      ).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await expect(writeText).toHaveBeenCalledWith("project-example");
      await expect(
        await canvas.findByText("Copied to clipboard."),
      ).toBeInTheDocument();
    } finally {
      writeText.mockRestore();
    }
  },
});
