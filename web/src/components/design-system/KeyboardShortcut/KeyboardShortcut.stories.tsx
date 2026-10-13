/* eslint-disable @repo/storybook-play-no-implementation-detail-assertions */
import { Keyboard, Play } from "lucide-react";
import { expect, within } from "storybook/test";

import { Button } from "@/src/components/ui/button";
import preview from "../../../../.storybook/preview";
import { KeyboardShortcut } from "./KeyboardShortcut";

const meta = preview.meta({
  component: KeyboardShortcut,
});

export const Default = meta.story({
  args: {
    keys: ["K"],
  },
});

// Multiple keys (e.g. a modifier + a letter) render as separate labels
// inside the same kbd, joined by a small gap — the "⌘K" / "Ctrl Enter" shape
// used for command-menu and submit hints.
export const MultipleKeys = meta.story({
  args: {
    keys: ["Mod", "Enter"],
  },
});

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <KeyboardShortcut keys={["K"]} />
        <KeyboardShortcut variant="subtle" keys={["K"]} />
        <KeyboardShortcut variant="inverse" keys={["K"]} />
        <KeyboardShortcut variant="keycap" keys={["K"]} />
        <KeyboardShortcut variant="keycap" keys={["Mod", "Enter"]} />
      </div>
      <div className="flex items-center gap-2">
        <KeyboardShortcut size="sm" keys={["K"]} />
        <KeyboardShortcut size="xs" keys={["K"]} />
      </div>
    </div>
  ),
});

// The chips almost never stand on their own in the product: they label the
// word, icon or button they sit next to, so their vertical rhythm is only
// visible with that neighbour in the frame.
export const BesideTextAndIcons = meta.story({
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        <KeyboardShortcut size="sm" keys={["Mod", "Enter"]} />
        complete + next ·
        <KeyboardShortcut size="sm" keys={["ArrowRight"]} />
        skip
      </span>
      <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1">
          <KeyboardShortcut size="sm" keys={["ArrowUp"]} />
          <KeyboardShortcut size="sm" keys={["ArrowDown"]} />
          move between fields
        </span>
        <span className="flex items-center gap-1">
          <KeyboardShortcut size="sm" keys={["1"]} />
          <span>…</span>
          <KeyboardShortcut size="sm" keys={["9"]} />
          select option
        </span>
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="lg" className="gap-1.5 px-4">
          <Keyboard className="icon-base text-icon-foreground" />
          Shortcuts
          <KeyboardShortcut keys={["?"]} />
        </Button>
        <Button size="lg" className="gap-1.5">
          <Play className="icon-base" />
          <span>Run All</span>
          <KeyboardShortcut variant="inverse" keys={["Mod", "Enter"]} />
        </Button>
      </div>
      <p className="text-muted-foreground max-w-sm text-xs">
        Bare <KeyboardShortcut size="sm" keys={["Enter"]} /> inside a text field
        inserts a new line — use{" "}
        <KeyboardShortcut size="sm" keys={["Mod", "Enter"]} /> to complete.
      </p>
    </div>
  ),
});

// Every key label is sized on its own — symbols are bumped one font step up so
// they do not draw small in the mono face — and a Tailwind `text-*` utility
// carries a line-height with it. That makes the chip's own box the only thing
// holding the labels on one line, so the guard is geometric: each label stays
// inside its chip and centred in it, at every size and in every variant.
export const TestGlyphsStayCentredInTheChip = meta.story({
  name: "(Test) Glyphs Stay Centred In The Chip",
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <KeyboardShortcut keys={["ArrowRight"]} />
        <KeyboardShortcut keys={["Mod", "Enter"]} />
        <KeyboardShortcut keys={["K"]} />
        <KeyboardShortcut variant="keycap" keys={["Mod", "Enter"]} />
      </div>
      <div className="flex items-center gap-2">
        <KeyboardShortcut size="sm" keys={["ArrowUp"]} />
        <KeyboardShortcut size="sm" keys={["1"]} />
        <KeyboardShortcut size="sm" keys={["?"]} />
      </div>
      <div className="flex items-center gap-2">
        <KeyboardShortcut size="xs" keys={["ArrowDown"]} />
        <KeyboardShortcut size="xs" keys={["9"]} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const chips = Array.from(canvasElement.querySelectorAll("kbd"));
    await expect(chips).toHaveLength(9);

    const round = (value: number) => Math.round(value * 10) / 10;
    const misaligned = chips.flatMap((chip) => {
      const chipBox = chip.getBoundingClientRect();
      const chipCentre = chipBox.top + chipBox.height / 2;

      return Array.from(chip.querySelectorAll("span")).flatMap((label) => {
        const labelBox = label.getBoundingClientRect();
        const offset = round(labelBox.top + labelBox.height / 2 - chipCentre);
        const overflow = round(
          Math.max(
            chipBox.top - labelBox.top,
            labelBox.bottom - chipBox.bottom,
          ),
        );
        const where = `"${label.textContent}" in the ${Math.round(chipBox.height)}px chip`;

        return [
          ...(Math.abs(offset) > 1
            ? [`${where}: ${offset}px off the chip's centre`]
            : []),
          ...(overflow > 1 ? [`${where}: ${overflow}px outside the chip`] : []),
        ];
      });
    });

    await expect(misaligned).toEqual([]);
  },
});

export const TestRendersMultipleKeys = meta.story({
  name: "(Test) Renders Multiple Keys",
  args: {
    keys: ["Mod", "Enter"],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const modLabel = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";
    const shortcut = canvas.getByText(modLabel).closest("kbd");

    await expect(shortcut).toBeInTheDocument();
    await expect(shortcut).toHaveClass("inline-flex");
    await expect(shortcut).not.toHaveClass("hidden");
    await expect(shortcut).toHaveTextContent(`${modLabel}↵`);
    await expect(shortcut?.querySelectorAll("span")).toHaveLength(2);
  },
});
