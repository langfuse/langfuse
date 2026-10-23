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

export const LandingWhileRunning = meta.story({
  args: {
    ...Landing.input.args,
    startBlockedReason:
      "Analysis is running. Topics appear here when it finishes.",
  },
});

export const LandingWithAutomaticOn = meta.story({
  args: {
    ...Landing.input.args,
    startBlockedReason:
      "Automatic processing is on. Topics appear here as traces are summarized.",
  },
});
