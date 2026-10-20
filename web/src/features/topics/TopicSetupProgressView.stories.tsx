import preview from "../../../.storybook/preview";
import { TopicSetupProgressView } from "./TopicSetupProgressView";

const meta = preview.meta({
  component: TopicSetupProgressView,
  args: { complete: 640, requested: 1280 },
});

export const Summarizing = meta.story({});
