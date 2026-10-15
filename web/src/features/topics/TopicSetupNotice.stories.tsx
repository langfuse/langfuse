import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicSetupNotice } from "./TopicSetupNotice";

const meta = preview.meta({ component: TopicSetupNotice });

export const Setup = meta.story({
  args: {
    notice: { unavailable: false, status: { kind: "setup" } },
    canWrite: true,
    canConfigure: true,
    onConfigure: fn(),
    onKeepOff: fn(),
    onTurnBackOn: fn(),
  },
});
