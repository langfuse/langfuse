import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicSetupNotice } from "./TopicSetupNotice";

const meta = preview.meta({ component: TopicSetupNotice });

export const Landing = meta.story({
  args: {
    notice: { status: null },
    canWrite: true,
    canConfigure: true,
    showOnboarding: true,
    onStart: fn(),
    onKeepOff: fn(),
    onTurnBackOn: fn(),
  },
});
