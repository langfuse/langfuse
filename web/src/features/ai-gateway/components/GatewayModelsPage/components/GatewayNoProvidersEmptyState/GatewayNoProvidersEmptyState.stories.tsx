import { expect, fn, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayNoProvidersEmptyState } from "./GatewayNoProvidersEmptyState";
import { GatewayNoProvidersReadOnlyEmptyState } from "./GatewayNoProvidersReadOnlyEmptyState";

const meta = preview.meta({
  component: GatewayNoProvidersEmptyState,
  parameters: { layout: "padded" },
});

export const Default = meta.story({
  args: { onAddProvider: fn(), onConnectProvider: fn() },
});

export const ConnectsProvider = meta.story({
  name: "(Test) Connect opens the dialog for that provider",
  args: { onAddProvider: fn(), onConnectProvider: fn() },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Anthropic/ }));
    await expect(args.onConnectProvider).toHaveBeenCalledWith("ANTHROPIC");
  },
});

export const ReadOnly = meta.story({
  render: () => <GatewayNoProvidersReadOnlyEmptyState />,
});
