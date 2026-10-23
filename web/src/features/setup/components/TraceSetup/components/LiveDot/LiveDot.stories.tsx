import preview from "@/.storybook/preview";
import { LiveDot } from "./LiveDot";

const meta = preview.meta({
  component: LiveDot,
});

export const Live = meta.story({
  args: { isLive: true },
});

export const Still = meta.story({
  args: { isLive: false },
});
