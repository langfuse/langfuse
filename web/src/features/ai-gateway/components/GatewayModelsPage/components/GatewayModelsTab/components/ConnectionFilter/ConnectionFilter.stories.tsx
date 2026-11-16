import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { ConnectionFilter } from "./ConnectionFilter";

const meta = preview.meta({
  component: ConnectionFilter,
  args: {
    connections: [
      { id: "openai", name: "OpenAI", provider: "OPENAI" as const },
      { id: "anthropic", name: "Anthropic", provider: "ANTHROPIC" as const },
      { id: "bedrock", name: "Bedrock EU", provider: "BEDROCK" as const },
    ],
    value: "openai",
    onChange: fn(),
  },
});

export const Default = meta.story({});

const longAnthropicName = "Anthropic production connection for the EU team";

export const LongNames = meta.story({
  name: "(Test) Long names truncate and show in full on hover",
  args: {
    connections: [
      {
        id: "anthropic",
        name: longAnthropicName,
        provider: "ANTHROPIC" as const,
      },
      {
        id: "openai",
        name: "OpenAI production connection for the EU team",
        provider: "OPENAI" as const,
      },
    ],
    value: "anthropic",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("combobox");
    await expect(within(trigger).getByTitle(longAnthropicName)).toBeVisible();

    await userEvent.click(trigger);
    const option = body.getByRole("option", { name: longAnthropicName });
    const label = within(option).getByText(longAnthropicName);
    await expect(getComputedStyle(label).textOverflow).toBe("ellipsis");
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    await expect(
      label.closest(`[title="${longAnthropicName}"]`),
    ).not.toBeNull();
  },
});

export const OptionsHiddenFromSessionReplay = meta.story({
  name: "(Test) Open options are hidden from session replay",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox"));
    await expect(
      body.getByRole("listbox").closest(".ph-no-capture"),
    ).not.toBeNull();
  },
});
