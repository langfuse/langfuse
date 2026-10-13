import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { AutomaticProcessingMenu } from "./AutomaticProcessingMenu";

const meta = preview.meta({
  component: AutomaticProcessingMenu,
  parameters: { layout: "centered" },
  args: {
    canWrite: true,
    onEnable: fn(),
    onEditSampling: fn(),
    onTurnOff: fn(),
  },
});

export default meta;

export const Unconfigured = meta.story({
  args: { state: { status: "unconfigured" } },
});

export const Off = meta.story({
  name: "(Test) Off offers to turn on",
  args: { state: { status: "off" } },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("button", { name: /Automatic: Off/ }));
    await userEvent.click(await body.findByText("Turn on…"));
    await expect(args.onEnable).toHaveBeenCalledOnce();
  },
});

export const On = meta.story({
  name: "(Test) On offers to turn off",
  args: { state: { status: "on", sampling: 0.25 } },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(
      body.getByRole("button", { name: /Automatic: On · 25%/ }),
    );
    await userEvent.click(await body.findByText("Turn off"));
    await expect(args.onTurnOff).toHaveBeenCalledOnce();
  },
});

export const Paused = meta.story({
  args: {
    state: { status: "paused", shortLabel: "LLM connection missing" },
  },
});
