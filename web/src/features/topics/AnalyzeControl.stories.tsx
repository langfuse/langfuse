import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { AnalyzeControl } from "./AnalyzeControl";

const meta = preview.meta({
  component: AnalyzeControl,
  parameters: { layout: "centered" },
  args: {
    onClick: fn(),
  },
});

export default meta;

export const On = meta.story({ args: { state: { status: "on" } } });

export const Off = meta.story({ args: { state: { status: "off" } } });

export const Paused = meta.story({
  args: { state: { status: "paused", shortLabel: "LLM connection missing" } },
});

export const Unconfigured = meta.story({
  args: {
    state: { status: "unconfigured" },
    disabledReason: "Configure Topics first.",
  },
});

export const ReadOnly = meta.story({
  args: {
    state: { status: "on" },
    disabledReason: "You need permission to edit Topics.",
  },
});

export const OpensDialog = meta.story({
  name: "(Test) Click opens the Analyze traces dialog",
  args: { state: { status: "on" } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Auto-analyze: On" }),
    );
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

export const DisabledWithoutSettings = meta.story({
  name: "(Test) Unconfigured is disabled with a reason",
  args: {
    state: { status: "unconfigured" },
    disabledReason: "Configure Topics first.",
  },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", {
      name: "Analyze",
    });
    await expect(button).toBeDisabled();
    await expect(button.parentElement).toHaveAttribute(
      "title",
      "Configure Topics first.",
    );
  },
});
