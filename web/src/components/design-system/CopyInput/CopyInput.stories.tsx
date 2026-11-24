import { type ComponentProps } from "react";
import { expect, spyOn, userEvent, waitFor, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { CopyInput } from "./CopyInput";

const meta = preview.meta({
  render: function Render(
    args: Omit<ComponentProps<typeof CopyInput>, "clipboard">,
  ) {
    const clipboard = useCopyToClipboard();
    return <CopyInput {...args} clipboard={clipboard} />;
  },
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
      const copyButton = canvas.getByRole("button", {
        name: "Copy project ID",
      });
      await expect(copyButton).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await expect(writeText).toHaveBeenCalledWith("project-example");
      const firstStatus = await canvas.findByText("Copied to clipboard.");

      await userEvent.click(copyButton);
      await expect(writeText).toHaveBeenCalledTimes(2);
      const secondStatus = await canvas.findByText("Copied to clipboard.");
      await expect(secondStatus).not.toBe(firstStatus);
      await expect(firstStatus).toBeEmptyDOMElement();

      await waitFor(() => expect(secondStatus).toBeEmptyDOMElement(), {
        timeout: 2_000,
      });
      await userEvent.click(copyButton);
      await expect(writeText).toHaveBeenCalledTimes(3);
      await expect(
        await canvas.findByText("Copied to clipboard."),
      ).toBeInTheDocument();
    } finally {
      writeText.mockRestore();
    }
  },
});
