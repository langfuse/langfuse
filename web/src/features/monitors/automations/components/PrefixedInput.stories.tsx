import { expect, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { PrefixedInput } from "./PrefixedInput";

const meta = preview.meta({
  component: PrefixedInput,
  args: {
    "aria-label": "Webhook URL",
    addon: "POST",
    prefix: "https://",
    placeholder: "example.com/webhook",
  },
});

export const Default = meta.story({});

export const WithoutAddon = meta.story({
  args: {
    "aria-label": "Repository dispatch URL",
    addon: undefined,
    placeholder: "api.github.com/repos/owner/repo/dispatches",
  },
});

export const Invalid = meta.story({
  args: { value: "not a url", error: true, "aria-invalid": true },
});

export const TestFocusesOnAddonClick = meta.story({
  name: "(Test) Focuses on addon click",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("POST"));
    await expect(
      canvas.getByRole("textbox", { name: "Webhook URL" }),
    ).toHaveFocus();
  },
});
