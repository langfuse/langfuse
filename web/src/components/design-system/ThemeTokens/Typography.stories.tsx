import preview from "../../../../.storybook/preview";
import { Typography } from "./Typography";

const meta = preview.meta({
  component: Typography,
  parameters: {
    layout: "fullscreen",
  },
});

export const Specimens = meta.story({});
