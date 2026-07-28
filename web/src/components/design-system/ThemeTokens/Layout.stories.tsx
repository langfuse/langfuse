import preview from "../../../../.storybook/preview";
import { Layout as LayoutPage } from "./Layout";

const meta = preview.meta({
  component: LayoutPage,
  parameters: {
    layout: "fullscreen",
  },
});

// Named after the component so Storybook's single-story hoisting collapses
// Design / Layout into one sidebar leaf.
export const Layout = meta.story({});
