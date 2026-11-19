import { expect, fn, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayApiKeysEmptyState } from "./GatewayApiKeysEmptyState";

const meta = preview.meta({ component: GatewayApiKeysEmptyState });

export const Default = meta.story({ args: { onCreateKey: fn() } });

export const CreatesKey = meta.story({
  name: "(Test) Creates Key",
  args: Default.input.args,
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Create gateway key" }),
    );
    await expect(args.onCreateKey).toHaveBeenCalledOnce();
  },
});
