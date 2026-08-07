import preview from "../../../../.storybook/preview";
import { Palette as PalettePage } from "./Palette";

const meta = preview.meta({
  component: PalettePage,
  parameters: {
    layout: "fullscreen",
  },
});

// Named after the component so Storybook's single-story hoisting collapses
// Design / Palette into one sidebar leaf.
export const Palette = meta.story({});
