import { expect, userEvent, within } from "storybook/test";
import { Search } from "@langfuse/icons";

import preview from "../../../../.storybook/preview";
import { Input } from "./Input";

const meta = preview.meta({
  component: Input,
});

export const Default = meta.story({
  args: {
    "aria-label": "Dataset name",
    placeholder: "Enter a dataset name",
  },
});

export const WithValue = meta.story({
  args: {
    "aria-label": "Dataset name",
    defaultValue: "production/evaluations",
  },
});

export const Invalid = meta.story({
  args: {
    "aria-label": "Dataset name",
    "aria-invalid": true,
    defaultValue: "Existing dataset",
    error: true,
  },
});

export const Disabled = meta.story({
  args: {
    "aria-label": "Dataset name",
    disabled: true,
    defaultValue: "production/evaluations",
  },
});

export const Inline = meta.story({
  args: {
    "aria-label": "Project name",
    defaultValue: "ai-gateway",
    layout: "inline",
  },
  render: (args) => (
    <p className="flex items-center gap-2 text-sm">
      Record in a new project named
      <span className="w-fit">
        <Input {...args} />
      </span>
    </p>
  ),
});

export const TestAcceptsText = meta.story({
  name: "(Test) Accepts Text",
  args: {
    "aria-label": "Dataset name",
  },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText("Dataset name");

    await userEvent.type(input, "production/evaluations");
    await expect(input).toHaveValue("production/evaluations");
  },
});

export const WithIconPrefix = meta.story({
  args: {
    "aria-label": "Search datasets",
    prefix: { icon: Search },
    placeholder: "Search datasets",
  },
});

export const WithLabelAndIconPrefix = meta.story({
  args: {
    "aria-label": "Search datasets",
    prefix: { label: "Search", icon: Search },
    placeholder: "Dataset name",
  },
});

export const WithPrefixes = meta.story({
  name: "(Test) Prefix clicks focus the editable value",
  args: {
    "aria-label": "Webhook URL",
    prefix: { label: "POST" },
    valuePrefix: "https://",
    placeholder: "example.com/webhook",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Webhook URL" });
    await userEvent.click(canvas.getByText("POST"));
    await expect(input).toHaveFocus();
    await userEvent.tab();
    await userEvent.click(canvas.getByText("https://"));
    await expect(input).toHaveFocus();
    await userEvent.type(input, "example.com/webhook");
    await expect(input).toHaveValue("example.com/webhook");
  },
});

export const WithValuePrefix = meta.story({
  args: {
    "aria-label": "Repository dispatch URL",
    valuePrefix: "https://",
    placeholder: "api.github.com/repos/owner/repo/dispatches",
  },
});

export const WithPrefix = meta.story({
  args: {
    "aria-label": "Webhook URL",
    prefix: { label: "POST" },
    placeholder: "https://example.com/webhook",
  },
});

export const InvalidWithPrefixes = meta.story({
  args: {
    "aria-label": "Webhook URL",
    prefix: { label: "POST" },
    valuePrefix: "https://",
    defaultValue: "not a url",
    error: true,
    "aria-invalid": true,
  },
});

export const DisabledWithPrefixes = meta.story({
  args: {
    "aria-label": "Webhook URL",
    prefix: { label: "POST" },
    valuePrefix: "https://",
    defaultValue: "example.com/webhook",
    disabled: true,
  },
});
