import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { AnalyzeMenu } from "./AnalyzeMenu";

const meta = preview.meta({
  component: AnalyzeMenu,
  parameters: { layout: "centered" },
  args: {
    canWrite: true,
    manualAvailable: true,
    onAutomatic: fn(),
    onManual: fn(),
  },
});

export default meta;

export const Unconfigured = meta.story({
  args: { state: { status: "unconfigured" }, manualAvailable: false },
});

export const Off = meta.story({ args: { state: { status: "off" } } });

export const On = meta.story({ args: { state: { status: "on" } } });

export const Paused = meta.story({
  args: { state: { status: "paused", shortLabel: "LLM connection missing" } },
});

export const ReadOnly = meta.story({
  args: { state: { status: "on" }, canWrite: false },
});

export const OpensAutomaticDialog = meta.story({
  name: "(Test) Opens the automatic analysis dialog",
  args: { state: { status: "off" } },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("button", { name: "Analyze: Off" }));
    await userEvent.click(
      await body.findByRole("menuitem", {
        name: "Analyze new traces automatically…",
      }),
    );
    await expect(args.onAutomatic).toHaveBeenCalledOnce();
    await expect(args.onManual).not.toHaveBeenCalled();
  },
});
