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
        <KeyboardShortcut variant="onPrimary" keys={["K"]} />
      </div>
      <div className="flex items-center gap-2">
        <KeyboardShortcut size="sm" keys={["K"]} />
        <KeyboardShortcut size="xs" keys={["K"]} />
        <KeyboardShortcut display="groupFocus" keys={["K"]} />
      </div>
    </div>
  ),
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
    await expect(shortcut).toHaveTextContent(`${modLabel}↵`);
    await expect(shortcut?.querySelectorAll("span")).toHaveLength(2);
  },
});
