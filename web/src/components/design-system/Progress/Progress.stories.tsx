import preview from "../../../../.storybook/preview";
import { Progress } from "./Progress";

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

export const NearLimit = meta.story({
  args: {
    value: 88,
    tone: "warning",
    label: "Usage of the plan limit",
  },
});

export const OverLimit = meta.story({
  args: {
    value: 100,
    tone: "critical",
    label: "Usage of the plan limit",
  },
});
