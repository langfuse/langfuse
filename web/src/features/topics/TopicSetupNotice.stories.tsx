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

export const ReadyToProcess = meta.story({
  args: {
    canWrite: true,
    canConfigure: true,
    onConfigure: fn(),
    onKeepOff: fn(),
    onTurnBackOn: fn(),
    notice: { unavailable: false, status: null },
    showOnboarding: true,
    configured: true,
    canProcess: true,
    onAutomaticProcessing: fn(),
    onManualProcessing: fn(),
  },
});

export const Processing = meta.story({
  args: {
    notice: { unavailable: false, status: null },
    canWrite: true,
    canConfigure: true,
    onConfigure: fn(),
    onKeepOff: fn(),
    onTurnBackOn: fn(),
    showOnboarding: true,
    configured: true,
    canProcess: true,
    onAutomaticProcessing: fn(),
    onManualProcessing: fn(),
    automaticEnabled: true,
    running: true,
  },
});
