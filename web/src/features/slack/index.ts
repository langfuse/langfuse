// The slack feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
export {
  ChannelSelector,
  type SlackChannel,
} from "@/src/features/slack/components/ChannelSelector";
export { SlackConnectionCard } from "@/src/features/slack/components/SlackConnectionCard";
export { SlackTestMessageButton } from "@/src/features/slack/components/SlackTestMessageButton";
export {
  ChannelSelectorView,
  type ChannelSelectorViewProps,
} from "@/src/features/slack/components/ChannelSelectorView/ChannelSelectorView";
export { useChannelSelectorData } from "@/src/features/slack/hooks/useChannelSelectorData";
export { useSlackConnect } from "@/src/features/slack/hooks/useSlackConnect";
export { useSlackTestMessage } from "@/src/features/slack/hooks/useSlackTestMessage";
export { type SlackTestMessageResult } from "@/src/features/slack/hooks/useSlackTestMessage";
