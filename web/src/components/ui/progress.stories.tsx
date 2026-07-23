import preview from "../../../.storybook/preview";
import { Progress } from "./progress";

const meta = preview.meta({
  component: Progress,
});

export const Empty = meta.story({
  args: {
    value: 0,
  },
});

export const InProgress = meta.story({
  args: {
    value: 50,
  },
});

export const Complete = meta.story({
  args: {
    value: 100,
  },
});
