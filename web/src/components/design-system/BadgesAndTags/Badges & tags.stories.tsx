import preview from "../../../../.storybook/preview";
import { BadgesAndTags as BadgesAndTagsPage } from "./BadgesAndTags";

const meta = preview.meta({
  component: BadgesAndTagsPage,
  parameters: {
    layout: "fullscreen",
  },
});

// Display name matches the file title so Storybook's single-story hoisting
// collapses Design / Badges & tags into one sidebar leaf.
export const BadgesAndTags = meta.story({ name: "Badges & tags" });
