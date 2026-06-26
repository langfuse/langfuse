/**
 * Phase-0 design exploration: 4 genuinely different double-panel layouts for the
 * trace detail surface (tree/timeline ↔ detail), each shown at desktop / narrow
 * peek / mobile widths. Pick a direction here before implementing.
 *
 * See takes.tsx for what each take is; parts.tsx for the shared mock panes.
 */

import preview from "../../../../../../.storybook/preview";
import {
  TakeAdaptiveOverlay,
  TakeIconRail,
  TakePositionSwitcher,
  TakeSegmentedMode,
} from "./takes";
import { IconRailTriptych, Stage, Triptych } from "./storyShell";

const meta = preview.meta({
  title: "Trace/Layout Exploration",
  parameters: { layout: "fullscreen" },
});

// A · Position Switcher --------------------------------------------------------
export const APositionSwitcherCompare = meta.story({
  name: "A · Position Switcher — compare widths",
  render: () => <Triptych take={TakePositionSwitcher} />,
});
export const APositionSwitcherLive = meta.story({
  name: "A · Position Switcher — live (resize the canvas)",
  render: () => <Stage take={TakePositionSwitcher} />,
});

// B · Icon Rail ----------------------------------------------------------------
export const BIconRailCompare = meta.story({
  name: "B · Icon Rail — compare widths",
  render: () => <IconRailTriptych />,
});
export const BIconRailLive = meta.story({
  name: "B · Icon Rail — live (resize the canvas)",
  render: () => <Stage take={TakeIconRail} />,
});

// C · Segmented Mode -----------------------------------------------------------
export const CSegmentedModeCompare = meta.story({
  name: "C · Segmented Mode — compare widths",
  render: () => <Triptych take={TakeSegmentedMode} />,
});
export const CSegmentedModeLive = meta.story({
  name: "C · Segmented Mode — live (resize the canvas)",
  render: () => <Stage take={TakeSegmentedMode} />,
});

// D · Adaptive Overlay ---------------------------------------------------------
export const DAdaptiveOverlayCompare = meta.story({
  name: "D · Adaptive Overlay — compare widths",
  render: () => <Triptych take={TakeAdaptiveOverlay} />,
});
export const DAdaptiveOverlayLive = meta.story({
  name: "D · Adaptive Overlay — live (resize the canvas)",
  render: () => <Stage take={TakeAdaptiveOverlay} />,
});
