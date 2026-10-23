import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { AnalyzeControl } from "./AnalyzeControl";

const meta = preview.meta({
  component: AnalyzeControl,
  parameters: { layout: "centered" },
  args: {
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

export const StartsOneOffRun = meta.story({
  name: "(Test) Off starts a one-off run",
  args: { state: { status: "off" } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Analyze traces" }),
    );
    await expect(args.onManual).toHaveBeenCalledOnce();
    await expect(args.onAutomatic).not.toHaveBeenCalled();
  },
});

export const OnOpensAutomaticDialog = meta.story({
  name: "(Test) On opens the automatic dialog",
  args: { state: { status: "on" } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Auto-analyze on" }),
    );
    await expect(args.onAutomatic).toHaveBeenCalledOnce();
  },
});
