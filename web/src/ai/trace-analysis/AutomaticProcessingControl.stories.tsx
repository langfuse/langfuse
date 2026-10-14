import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { AutomaticProcessingControl } from "./AutomaticProcessingControl";

const meta = preview.meta({
  component: AutomaticProcessingControl,
  parameters: { layout: "centered" },
  args: { canWrite: true, onOpen: fn() },
});

export default meta;

export const Unconfigured = meta.story({
  args: { state: { status: "unconfigured" } },
});

export const Off = meta.story({
  name: "(Test) Opens the dialog to turn on",
  args: { state: { status: "off" } },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(
      body.getByRole("button", { name: /Automatic processing/ }),
    );
    await expect(args.onOpen).toHaveBeenCalledOnce();
  },
});

export const On = meta.story({ args: { state: { status: "on" } } });

export const Paused = meta.story({
  args: { state: { status: "paused", shortLabel: "LLM connection missing" } },
});
