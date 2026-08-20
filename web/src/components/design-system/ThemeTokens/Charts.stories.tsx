import preview from "../../../../.storybook/preview";
import { Charts as ChartsPage } from "./Charts";

const meta = preview.meta({
  component: ChartsPage,
  parameters: {
    layout: "fullscreen",
  },
});

// Named after the component so Storybook's single-story hoisting collapses
// Design / Charts into one sidebar leaf.
export const Charts = meta.story({});
