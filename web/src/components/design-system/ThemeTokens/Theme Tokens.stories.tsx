import preview from "../../../../.storybook/preview";
import { ThemeTokens } from "./ThemeTokens";

const meta = preview.meta({
  component: ThemeTokens,
  parameters: {
    layout: "fullscreen",
  },
});

export const Gallery = meta.story({});
