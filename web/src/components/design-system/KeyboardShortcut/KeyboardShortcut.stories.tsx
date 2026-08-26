import { expect, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { KeyboardShortcut } from "./KeyboardShortcut";

const meta = preview.meta({
  component: KeyboardShortcut,
});

// Hidden below the `md` breakpoint (768px, the same cutoff `useIsMobile`
// uses) by default: a keyboard-shortcut hint is noise on a touch device with
// no physical keyboard. The underlying shortcut still fires there
// — only this visual chip is gated. Resize the Storybook canvas below 768px
// to see it disappear (CSS-only; jsdom-based story tests don't apply media
// queries, so this is only visible when the canvas renders in a real browser).
export const Default = meta.story({
  args: {
    children: "K",
  },
});

// Multiple glyphs (e.g. a modifier + a letter) render as separate chips
// inside the same kbd, joined by a small gap — the "⌘K" / "⌘ Enter" shape
// used for command-menu and submit hints.
export const MultipleKeys = meta.story({
  args: {
    keys: ["⌘", "Enter"],
  },
});

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <KeyboardShortcut>K</KeyboardShortcut>
        <KeyboardShortcut variant="subtle">K</KeyboardShortcut>
        <KeyboardShortcut variant="onPrimary">K</KeyboardShortcut>
      </div>
      <div className="flex items-center gap-2">
        <KeyboardShortcut size="sm">K</KeyboardShortcut>
        <KeyboardShortcut size="xs">K</KeyboardShortcut>
        <KeyboardShortcut display="groupFocus">K</KeyboardShortcut>
      </div>
    </div>
  ),
});

export const TestRendersMultipleKeys = meta.story({
  name: "(Test) Renders Multiple Keys",
  args: {
    keys: ["⌘", "Enter"],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shortcut = canvas.getByText("⌘").closest("kbd");

    await expect(shortcut).toBeInTheDocument();
    await expect(shortcut).toHaveTextContent("⌘Enter");
    await expect(shortcut?.querySelectorAll("span")).toHaveLength(2);
  },
});
