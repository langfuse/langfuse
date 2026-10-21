import preview from "../../../.storybook/preview";
import { Badge } from "./badge";

const meta = preview.meta({
  component: Badge,
  args: {
    children: "Badge",
  },
});

export const Default = meta.story({});
