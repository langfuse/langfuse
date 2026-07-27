import preview from "../../../../.storybook/preview";
import { Typography as TypographyPage } from "./Typography";

const meta = preview.meta({
  component: TypographyPage,
  parameters: {
    layout: "fullscreen",
  },
});

// Named after the component so Storybook's single-story hoisting collapses
// Design / Theme Tokens / Typography into one sidebar leaf.
export const Typography = meta.story({});
