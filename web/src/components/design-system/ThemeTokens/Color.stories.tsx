import preview from "../../../../.storybook/preview";
import { Color as ColorPage } from "./Color";

const meta = preview.meta({
  component: ColorPage,
  parameters: {
    layout: "fullscreen",
  },
});

// Named after the component so Storybook's single-story hoisting collapses
// Design / Color into one sidebar leaf.
export const Color = meta.story({});
