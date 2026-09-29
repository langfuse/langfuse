import preview from "../../preview";
import { Icons as IconsPage } from "./Icons";

const meta = preview.meta({
  component: IconsPage,
  parameters: {
    layout: "fullscreen",
  },
});

// Named after the component so Storybook's single-story hoisting collapses
// Design / Icons into one sidebar leaf.
export const Icons = meta.story({});
