import preview from "../../../.storybook/preview";
import { KeyboardShortcut } from "./keyboard-shortcut";

const meta = preview.meta({
  component: KeyboardShortcut,
});

// Hidden below the `md` breakpoint (768px, the same cutoff `useIsMobile`
// uses) by default: a keyboard-shortcut hint is noise on a touch device with
// no physical keyboard (LFE-11067). The underlying shortcut still fires there
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
