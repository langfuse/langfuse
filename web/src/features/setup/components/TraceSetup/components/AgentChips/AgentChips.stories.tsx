import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { AgentChips } from "./AgentChips";

const meta = preview.meta({
  component: AgentChips,
});

const onPreview = fn();

export const Start = meta.story({
  args: {
    current: null,
    labelFor: (name: string) => `Set up ${name}`,
    onPick: fn(),
    onPreview,
    onBrowseMore: fn(),
  },
});

export const Current = meta.story({
  args: {
    current: "codex",
    onPick: fn(),
    onBrowseMore: fn(),
  },
});

export const PickedFromTheRest = meta.story({
  args: {
    current: "cursor",
    onPick: fn(),
    onBrowseMore: fn(),
  },
});

export const TestStartsASetup = meta.story({
  name: "(Test) A chip starts its agent's setup and previews it",
  args: Start.input.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const codex = canvas.getByRole("button", { name: "Set up Codex" });
    await expect(codex).not.toHaveAttribute("aria-pressed");
    codex.focus();
    await expect(onPreview).toHaveBeenCalledWith(1);
    await userEvent.click(codex);
    await expect(args.onPick).toHaveBeenCalledWith("codex");
  },
});

export const TestPressesTheCurrentAgent = meta.story({
  name: "(Test) The agent being set up is pressed, one from the rest gets a chip",
  args: PickedFromTheRest.input.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Cursor" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: "Codex" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Codex" }));
    await expect(args.onPick).toHaveBeenCalledWith("codex");
    await userEvent.click(canvas.getByRole("button", { name: /^\+\d+ more$/ }));
    await expect(args.onBrowseMore).toHaveBeenCalledOnce();
  },
});
